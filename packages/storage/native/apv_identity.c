/* Read-only identity attestor. Never closes/replaces a borrowed SQLite handle.
 * sqlite3_api comes from the target connection's loadExtension invocation. */
#define _WIN32_WINNT 0x0602
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdint.h>
#include <string.h>
#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT1
_Static_assert(sizeof(void *) == 8, "Windows x64 required");

static void fail(sqlite3_context *ctx, int rc, DWORD win) {
  char *json = sqlite3_mprintf("{\"status\":\"unavailable\",\"fcntlRc\":%d,\"win32Error\":%lu}", rc, (unsigned long)win);
  if (!json) { sqlite3_result_error_nomem(ctx); return; }
  sqlite3_result_text(ctx, json, -1, sqlite3_free);
}
static void quoted(sqlite3_str *out, const char *s) {
  sqlite3_str_appendchar(out, 1, '"');
  for (; *s; s++) { if (*s == '\\' || *s == '"') sqlite3_str_appendchar(out, 1, '\\'); sqlite3_str_appendchar(out, 1, *s); }
  sqlite3_str_appendchar(out, 1, '"');
}
static void inspect(sqlite3_context *ctx, HANDLE h, const char *origin, int rc) {
  FILE_ID_INFO id; BY_HANDLE_FILE_INFORMATION basic; WCHAR final[32768], fsname[32]; char utf8[131072], fid[33];
  DWORD n; unsigned i;
  if (h == NULL || h == INVALID_HANDLE_VALUE) { fail(ctx, rc, ERROR_INVALID_HANDLE); return; }
  if (!GetFileInformationByHandleEx(h, FileIdInfo, &id, sizeof(id)) || !GetFileInformationByHandle(h, &basic)) { fail(ctx, rc, GetLastError()); return; }
  if (basic.nNumberOfLinks != 1 || (basic.dwFileAttributes & (FILE_ATTRIBUTE_REPARSE_POINT | FILE_ATTRIBUTE_DIRECTORY))) { fail(ctx, rc, ERROR_NOT_SUPPORTED); return; }
  if (!GetVolumeInformationByHandleW(h, NULL, 0, NULL, NULL, NULL, fsname, 32) || wcscmp(fsname, L"NTFS") != 0) { fail(ctx, rc, ERROR_NOT_SUPPORTED); return; }
  n = GetFinalPathNameByHandleW(h, final, 32768, FILE_NAME_NORMALIZED | VOLUME_NAME_DOS);
  if (!n || n >= 32768 || !WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, final, -1, utf8, sizeof(utf8), NULL, NULL)) { fail(ctx, rc, GetLastError()); return; }
  for (i = 0; i < 16; i++) { fid[i*2] = "0123456789abcdef"[id.FileId.Identifier[i] >> 4]; fid[i*2+1] = "0123456789abcdef"[id.FileId.Identifier[i] & 15]; } fid[32] = 0;
  sqlite3_str *out = sqlite3_str_new(sqlite3_context_db_handle(ctx));
  sqlite3_str_appendf(out, "{\"status\":\"ok\",\"origin\":\"%s\",\"pid\":%lu,\"fcntlRc\":%d,\"win32Error\":0,\"volumeSerial\":\"%016llx\",\"fileId\":\"%s\",\"links\":1,\"fileSystem\":\"NTFS\",\"finalPath\":", origin, (unsigned long)GetCurrentProcessId(), rc, (unsigned long long)id.VolumeSerialNumber, fid);
  quoted(out, utf8); sqlite3_str_appendall(out, "}");
  char *json = sqlite3_str_finish(out); if (!json) { sqlite3_result_error_nomem(ctx); return; } sqlite3_result_text(ctx, json, -1, sqlite3_free);
}
static void main_identity(sqlite3_context *ctx, int argc, sqlite3_value **argv) {
  HANDLE borrowed = INVALID_HANDLE_VALUE; (void)argc; (void)argv;
  int rc = sqlite3_file_control(sqlite3_context_db_handle(ctx), "main", SQLITE_FCNTL_WIN32_GET_HANDLE, &borrowed);
  if (rc != SQLITE_OK) { fail(ctx, rc, 0); return; }
  inspect(ctx, borrowed, "sqlite-main-borrowed", rc); /* no CloseHandle */
}
static void wal_identity(sqlite3_context *ctx, int argc, sqlite3_value **argv) {
  sqlite3_file *wal = NULL; HANDLE borrowed = INVALID_HANDLE_VALUE; (void)argc; (void)argv;
  int rc = sqlite3_file_control(sqlite3_context_db_handle(ctx), "main", SQLITE_FCNTL_JOURNAL_POINTER, &wal);
  if (rc != SQLITE_OK || !wal || !wal->pMethods || !wal->pMethods->xFileControl) { fail(ctx, rc == SQLITE_OK ? SQLITE_NOTFOUND : rc, 0); return; }
  rc = wal->pMethods->xFileControl(wal, SQLITE_FCNTL_WIN32_GET_HANDLE, &borrowed);
  if (rc != SQLITE_OK) { fail(ctx, rc, 0); return; }
  inspect(ctx, borrowed, "sqlite-journal-borrowed", rc); /* no CloseHandle */
}
static void path_identity(sqlite3_context *ctx, int argc, sqlite3_value **argv) {
  WCHAR name[32768]; (void)argc;
  if (sqlite3_value_type(argv[0]) != SQLITE_TEXT) { fail(ctx, SQLITE_MISMATCH, 0); return; }
  const char *s = (const char *)sqlite3_value_text(argv[0]); int bytes = sqlite3_value_bytes(argv[0]);
  if (!s || bytes < 1 || (int)strlen(s) != bytes || !MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, s, -1, name, 32768)) { fail(ctx, SQLITE_MISMATCH, 0); return; }
  HANDLE owned = CreateFileW(name, FILE_READ_ATTRIBUTES, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, NULL, OPEN_EXISTING, FILE_FLAG_OPEN_REPARSE_POINT, NULL);
  if (owned == INVALID_HANDLE_VALUE) { fail(ctx, SQLITE_OK, GetLastError()); return; }
  inspect(ctx, owned, "path-open-expected", SQLITE_OK);
  CloseHandle(owned); /* only the handle created by this function */
}
__declspec(dllexport) int sqlite3_apvidentity_init(sqlite3 *db, char **error, const sqlite3_api_routines *api) {
  SQLITE_EXTENSION_INIT2(api); (void)error;
  if (sqlite3_libversion_number() != 3053004) return SQLITE_ERROR;
  int flags = SQLITE_UTF8 | SQLITE_DIRECTONLY;
  int rc = sqlite3_create_function(db, "apv_main_identity", 0, flags, NULL, main_identity, NULL, NULL);
  if (rc == SQLITE_OK) rc = sqlite3_create_function(db, "apv_journal_identity", 0, flags, NULL, wal_identity, NULL, NULL);
  if (rc == SQLITE_OK) rc = sqlite3_create_function(db, "apv_path_identity", 1, flags, NULL, path_identity, NULL, NULL);
  return rc;
}
