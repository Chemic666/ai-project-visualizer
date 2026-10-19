/* Disposable Windows x64 no-fault VFS observer. No SQLite is linked here.
 * Callback results, buffers, flags, filename pointers and locks are delegated.
 * Trace failure never changes an underlying I/O result; G1 rejects incomplete trace.
 * Single synchronous SQLite execution thread only; not a production extension. */
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>
#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT1

#define VFS_NAME "apv_g1_nofault_v1"
#define TRACE_CAP 4096
#define PATH_CAP 1024
#define VFS_NAME_CAP 256
typedef struct Wrapped {
  sqlite3_file base;
  sqlite3_file *inner;
  sqlite3_io_methods methods;
  const char *name;
  sqlite3_int64 fileId;
  int kind;
} Wrapped;
_Static_assert(sizeof(void*) == 8, "Windows x64 only");
_Static_assert(sizeof(Wrapped) % 8 == 0, "Underlying WinFile alignment");
typedef struct Event {
  sqlite3_int64 seq, fileId, offset;
  DWORD pid, thread;
  int phase, kind, flags, amount, rc;
  const char *method;
  char path[PATH_CAP];
} Event;
static Event events[TRACE_CAP];
static sqlite3_vfs shim, *underlying;
static sqlite3_int64 sequence, nextFile;
static DWORD ownerThread;
static int phase, overflow, initialized;
static void record(const char *method, Wrapped *f, int flags, int amount,
                   sqlite3_int64 offset, int rc) {
  sqlite3_int64 slot = sequence++;
  Event *e;
  const char *name = f && f->name ? f->name : "";
  if (GetCurrentThreadId() != ownerThread || slot >= TRACE_CAP || strlen(name) >= PATH_CAP) {
    overflow = 1; return;
  }
  e = &events[slot];
  e->seq=slot+1; e->fileId=f?f->fileId:0; e->offset=offset;
  e->pid=GetCurrentProcessId(); e->thread=GetCurrentThreadId();
  e->phase=phase; e->kind=f?f->kind:0; e->flags=flags;
  e->amount=amount; e->rc=rc; e->method=method;
  memcpy(e->path,name,strlen(name)+1);
}
static Wrapped *wrap(sqlite3_file *f) { return (Wrapped*)f; }
#define INNER(f) (wrap(f)->inner)
#define METHODS(f) (INNER(f)->pMethods)
static int ioClose(sqlite3_file *f) { int rc=METHODS(f)->xClose(INNER(f)); record("xClose",wrap(f),0,0,0,rc); f->pMethods=NULL; return rc; }
static int ioRead(sqlite3_file *f, void *b, int n, sqlite3_int64 off) { int rc=METHODS(f)->xRead(INNER(f),b,n,off); record("xRead",wrap(f),0,n,off,rc); return rc; }
static int ioWrite(sqlite3_file *f, const void *b, int n, sqlite3_int64 off) { int rc=METHODS(f)->xWrite(INNER(f),b,n,off); record("xWrite",wrap(f),0,n,off,rc); return rc; }
static int ioTruncate(sqlite3_file *f, sqlite3_int64 n) { int rc=METHODS(f)->xTruncate(INNER(f),n); record("xTruncate",wrap(f),0,0,n,rc); return rc; }
static int ioSync(sqlite3_file *f, int flags) { int rc=METHODS(f)->xSync(INNER(f),flags); record("xSync",wrap(f),flags,0,0,rc); return rc; }
static int ioSize(sqlite3_file *f, sqlite3_int64 *n) { int rc=METHODS(f)->xFileSize(INNER(f),n); record("xFileSize",wrap(f),0,0,rc==SQLITE_OK?*n:0,rc); return rc; }
static int ioLock(sqlite3_file *f, int n) { int rc=METHODS(f)->xLock(INNER(f),n); record("xLock",wrap(f),n,0,0,rc); return rc; }
static int ioUnlock(sqlite3_file *f, int n) { int rc=METHODS(f)->xUnlock(INNER(f),n); record("xUnlock",wrap(f),n,0,0,rc); return rc; }
static int ioReserved(sqlite3_file *f, int *n) { int rc=METHODS(f)->xCheckReservedLock(INNER(f),n); record("xCheckReservedLock",wrap(f),0,0,0,rc); return rc; }
static int ioControl(sqlite3_file *f, int op, void *arg) { int rc=METHODS(f)->xFileControl(INNER(f),op,arg); record("xFileControl",wrap(f),op,0,0,rc); return rc; }
static int ioSector(sqlite3_file *f) { return METHODS(f)->xSectorSize(INNER(f)); }
static int ioDevice(sqlite3_file *f) { return METHODS(f)->xDeviceCharacteristics(INNER(f)); }
static int ioMap(sqlite3_file *f,int page,int size,int extend,void volatile **p) { int rc=METHODS(f)->xShmMap(INNER(f),page,size,extend,p); record("xShmMap",wrap(f),extend,size,page,rc); return rc; }
static int ioShmLock(sqlite3_file *f,int off,int n,int flags) { int rc=METHODS(f)->xShmLock(INNER(f),off,n,flags); record("xShmLock",wrap(f),flags,n,off,rc); return rc; }
static void ioBarrier(sqlite3_file *f) { METHODS(f)->xShmBarrier(INNER(f)); record("xShmBarrier",wrap(f),0,0,0,SQLITE_OK); }
static int ioUnmap(sqlite3_file *f,int del) { int rc=METHODS(f)->xShmUnmap(INNER(f),del); record("xShmUnmap",wrap(f),del,0,0,rc); return rc; }
static int ioFetch(sqlite3_file *f,sqlite3_int64 off,int n,void **p) { int rc=METHODS(f)->xFetch(INNER(f),off,n,p); record("xFetch",wrap(f),0,n,off,rc); return rc; }
static int ioUnfetch(sqlite3_file *f,sqlite3_int64 off,void *p) { int rc=METHODS(f)->xUnfetch(INNER(f),off,p); record("xUnfetch",wrap(f),0,0,off,rc); return rc; }
static int vOpen(sqlite3_vfs *v,sqlite3_filename name,sqlite3_file *out,int flags,int *outFlags) {
  Wrapped *f=(Wrapped*)out; int rc; (void)v;
  memset(f,0,sizeof(*f));
  f->inner=(sqlite3_file*)((unsigned char*)out+sizeof(*f));
  memset(f->inner,0,(size_t)underlying->szOsFile);
  f->name=name; f->fileId=++nextFile;
  f->kind=(flags&SQLITE_OPEN_WAL)?2:(flags&SQLITE_OPEN_MAIN_DB)?1:(flags&(SQLITE_OPEN_MAIN_JOURNAL|SQLITE_OPEN_TEMP_JOURNAL|SQLITE_OPEN_SUBJOURNAL))?3:4;
  rc=underlying->xOpen(underlying,name,f->inner,flags,outFlags);
  /* A failed xOpen may still install pMethods: preserve its cleanup path. */
  if (f->inner->pMethods) {
    const sqlite3_io_methods *m=f->inner->pMethods;
    f->methods.iVersion=m->iVersion;
    f->methods.xClose=ioClose; f->methods.xRead=ioRead; f->methods.xWrite=ioWrite;
    f->methods.xTruncate=ioTruncate; f->methods.xSync=ioSync; f->methods.xFileSize=ioSize;
    f->methods.xLock=ioLock; f->methods.xUnlock=ioUnlock; f->methods.xCheckReservedLock=ioReserved;
    f->methods.xFileControl=ioControl; f->methods.xSectorSize=ioSector; f->methods.xDeviceCharacteristics=ioDevice;
    if (m->iVersion>=2) {
      f->methods.xShmMap=m->xShmMap?ioMap:NULL; f->methods.xShmLock=m->xShmLock?ioShmLock:NULL;
      f->methods.xShmBarrier=m->xShmBarrier?ioBarrier:NULL; f->methods.xShmUnmap=m->xShmUnmap?ioUnmap:NULL;
    }
    if (m->iVersion>=3) { f->methods.xFetch=m->xFetch?ioFetch:NULL; f->methods.xUnfetch=m->xUnfetch?ioUnfetch:NULL; }
    f->base.pMethods=&f->methods;
  }
  record("xOpen",f,flags,outFlags&&rc==SQLITE_OK?*outFlags:0,0,rc); return rc;
}
static int vDelete(sqlite3_vfs *v,const char *n,int d) { (void)v; return underlying->xDelete(underlying,n,d); }
static int vAccess(sqlite3_vfs *v,const char *n,int flags,int *out) { (void)v; return underlying->xAccess(underlying,n,flags,out); }
static int vFull(sqlite3_vfs *v,const char *n,int len,char *out) { (void)v; return underlying->xFullPathname(underlying,n,len,out); }
static void *vDlOpen(sqlite3_vfs *v,const char *n) { (void)v; return underlying->xDlOpen(underlying,n); }
static void vDlError(sqlite3_vfs *v,int len,char *out) { (void)v; underlying->xDlError(underlying,len,out); }
static void (*vDlSym(sqlite3_vfs *v,void *h,const char *n))(void) { (void)v; return underlying->xDlSym(underlying,h,n); }
static void vDlClose(sqlite3_vfs *v,void *h) { (void)v; underlying->xDlClose(underlying,h); }
static int vRandom(sqlite3_vfs *v,int n,char *out) { (void)v; return underlying->xRandomness(underlying,n,out); }
static int vSleep(sqlite3_vfs *v,int n) { (void)v; return underlying->xSleep(underlying,n); }
static int vTime(sqlite3_vfs *v,double *n) { (void)v; return underlying->xCurrentTime(underlying,n); }
static int vError(sqlite3_vfs *v,int n,char *out) { (void)v; return underlying->xGetLastError(underlying,n,out); }
static int vTime64(sqlite3_vfs *v,sqlite3_int64 *n) { (void)v; return underlying->xCurrentTimeInt64(underlying,n); }
static int vSetCall(sqlite3_vfs *v,const char *n,sqlite3_syscall_ptr p) { (void)v; return underlying->xSetSystemCall(underlying,n,p); }
static sqlite3_syscall_ptr vGetCall(sqlite3_vfs *v,const char *n) { (void)v; return underlying->xGetSystemCall(underlying,n); }
static const char *vNextCall(sqlite3_vfs *v,const char *n) { (void)v; return underlying->xNextSystemCall(underlying,n); }

static void jsonPath(const char *s,char *out) {
  static const char hex[]="0123456789abcdef";
  while (*s) { unsigned char c=(unsigned char)*s++;
    if (c=='"'||c=='\\') { *out++='\\'; *out++=(char)c; }
    else if(c<32) { *out++='\\'; *out++='u'; *out++='0'; *out++='0'; *out++=hex[c>>4]; *out++=hex[c&15]; }
    else *out++=(char)c;
  } *out=0;
}
static void result(sqlite3_context *c,char *s) { if(s) sqlite3_result_text(c,s,-1,sqlite3_free); else sqlite3_result_error_nomem(c); }
/* Copy a live SQLite-owned string into a bounded JSON value. No pointer escapes
 * this SQL callback; the output needs capacity*6+3 bytes for JSON escaping. */
static int jsonStringCopy(const char *source,size_t capacity,char *out) {
  size_t n=0,escaped;
  if(!source) return 0;
  while(n<capacity && source[n]) ++n;
  if(n==0 || n==capacity) return 0;
  out[0]='"'; jsonPath(source,out+1); escaped=strlen(out+1);
  out[escaped+1]='"'; out[escaped+2]=0;
  return 1;
}
static void infoFn(sqlite3_context *c,int argc,sqlite3_value **argv) {
  sqlite3_vfs *selected=NULL; sqlite3 *db=sqlite3_context_db_handle(c);
  int rc=db?sqlite3_file_control(db,"main",SQLITE_FCNTL_VFS_POINTER,&selected):SQLITE_MISUSE;
  char actualName[VFS_NAME_CAP*6+3]="null",databaseFile[PATH_CAP*6+3]="null";
  const char *queryStatus="file_control_failed";
  (void)argc; (void)argv;
  if(rc==SQLITE_OK) {
    if(!selected) queryStatus="vfs_pointer_missing";
    else if(!jsonStringCopy(selected->zName,VFS_NAME_CAP,actualName)) queryStatus="vfs_name_unavailable";
    else queryStatus="ok";
  }
  if(db) jsonStringCopy(sqlite3_db_filename(db,"main"),PATH_CAP,databaseFile);
  result(c,sqlite3_mprintf("{\"api\":\"%p\",\"sqlite\":\"%s\",\"defaultShim\":%d,\"selectedShim\":%d,\"fileControlRc\":%d,\"actualVfsName\":%s,\"vfsQueryStatus\":\"%s\",\"databaseFile\":%s,\"pid\":%u,\"thread\":%u,\"traceCount\":%lld,\"overflow\":%d,\"autocommit\":%d,\"extendedError\":%d}",
    (void*)sqlite3_api,sqlite3_libversion(),sqlite3_vfs_find(NULL)==&shim,rc==SQLITE_OK&&selected==&shim,rc,actualName,queryStatus,databaseFile,(unsigned)GetCurrentProcessId(),(unsigned)GetCurrentThreadId(),sequence,overflow,db?sqlite3_get_autocommit(db):-1,db?sqlite3_extended_errcode(db):SQLITE_MISUSE));
}
static void phaseFn(sqlite3_context *c,int argc,sqlite3_value **argv) {
  (void)argc; phase=sqlite3_value_int(argv[0]); record("phase",NULL,phase,0,0,SQLITE_OK); sqlite3_result_int(c,phase);
}
static void eventFn(sqlite3_context *c,int argc,sqlite3_value **argv) {
  sqlite3_int64 i=sqlite3_value_int64(argv[0]); Event *e; char escaped[PATH_CAP*6+1]; (void)argc;
  if (i<0||i>=sequence||i>=TRACE_CAP||overflow) { sqlite3_result_error(c,"TRACE_INCOMPLETE",-1); return; }
  e=&events[i]; jsonPath(e->path,escaped);
  result(c,sqlite3_mprintf("{\"seq\":%lld,\"fileId\":%lld,\"pid\":%u,\"thread\":%u,\"phase\":%d,\"kind\":%d,\"method\":\"%s\",\"path\":\"%s\",\"flags\":%d,\"amount\":%d,\"offset\":%lld,\"rc\":%d}",e->seq,e->fileId,(unsigned)e->pid,(unsigned)e->thread,e->phase,e->kind,e->method,escaped,e->flags,e->amount,e->offset,e->rc));
}
static int registerFunctions(sqlite3 *db,char **error,const sqlite3_api_routines *api) {
  int rc; (void)error;
  if (api!=sqlite3_api||GetCurrentThreadId()!=ownerThread) return SQLITE_MISUSE;
  rc=sqlite3_create_function(db,"apv_vfs_info",0,SQLITE_UTF8,NULL,infoFn,NULL,NULL);
  if(rc==SQLITE_OK) rc=sqlite3_create_function(db,"apv_vfs_phase",1,SQLITE_UTF8,NULL,phaseFn,NULL,NULL);
  if(rc==SQLITE_OK) rc=sqlite3_create_function(db,"apv_vfs_event",1,SQLITE_UTF8,NULL,eventFn,NULL,NULL);
  return rc;
}
__declspec(dllexport) int sqlite3_apvvfs_init(sqlite3 *db,char **error,const sqlite3_api_routines *api) {
  int rc; (void)error;
  if (initialized) return SQLITE_ERROR; /* One initialization per disposable process. */
  SQLITE_EXTENSION_INIT2(api);
  if (strcmp(sqlite3_libversion(),SQLITE_VERSION)!=0) return SQLITE_ERROR;
  underlying=sqlite3_vfs_find(NULL);
  if (!underlying||strcmp(underlying->zName,"win32")!=0||underlying->iVersion<1||underlying->iVersion>3||sqlite3_vfs_find(VFS_NAME)) return SQLITE_ERROR;
  ownerThread=GetCurrentThreadId();
  shim=*underlying; shim.pNext=NULL; shim.zName=VFS_NAME;
  shim.szOsFile=underlying->szOsFile+(int)sizeof(Wrapped);
  shim.xOpen=vOpen; shim.xDelete=vDelete; shim.xAccess=vAccess; shim.xFullPathname=vFull;
  shim.xDlOpen=vDlOpen; shim.xDlError=vDlError; shim.xDlSym=vDlSym; shim.xDlClose=vDlClose;
  shim.xRandomness=vRandom; shim.xSleep=vSleep; shim.xCurrentTime=vTime; shim.xGetLastError=vError;
  if(shim.iVersion>=2) shim.xCurrentTimeInt64=underlying->xCurrentTimeInt64?vTime64:NULL;
  if(shim.iVersion>=3) {
    shim.xSetSystemCall=underlying->xSetSystemCall?vSetCall:NULL;
    shim.xGetSystemCall=underlying->xGetSystemCall?vGetCall:NULL;
    shim.xNextSystemCall=underlying->xNextSystemCall?vNextCall:NULL;
  }
  rc=registerFunctions(db,error,api); if(rc!=SQLITE_OK) return rc;
  rc=sqlite3_vfs_register(&shim,1); if(rc!=SQLITE_OK) return rc;
  rc=sqlite3_auto_extension((void(*)(void))registerFunctions);
  if(rc!=SQLITE_OK) { sqlite3_vfs_unregister(&shim); sqlite3_vfs_register(underlying,1); return rc; }
  initialized=1;
  return SQLITE_OK_LOAD_PERMANENTLY;
}
