#ifndef APV_G2_FAULT_POLICY_H
#define APV_G2_FAULT_POLICY_H
#include <string.h>
typedef struct ApvGate {
  int armed, spent, commitActive, commitSerial, mode;
  unsigned ownerPid, ownerThread;
} ApvGate;
/* Pure policy: no SQLite, filesystem, Driver or DLL dependency. */
static int apv_should_fault(const ApvGate *g,int method,int kind,int pathMatch,
                           int mainMatch,int writeTxn,unsigned pid,unsigned thread) {
  return g->armed && !g->spent && g->commitActive && g->commitSerial==1 &&
         g->mode==method && kind==2 && pathMatch && mainMatch && writeTxn &&
         pid==g->ownerPid && thread==g->ownerThread;
}
static int apv_commit_sql(const char *z) {
  static const char text[]="COMMIT"; int i;
  if(!z) return 0;
  while(*z==' '||*z=='\t'||*z=='\r'||*z=='\n') ++z;
  for(i=0;i<6;i++) { char c=z[i]; if(!c) return 0;
    if(c>='a'&&c<='z') c=(char)(c-'a'+'A'); if(c!=text[i]) return 0;
  }
  z+=6; while(*z==' '||*z=='\t'||*z=='\r'||*z=='\n') ++z;
  if(*z==';') ++z;
  while(*z==' '||*z=='\t'||*z=='\r'||*z=='\n') ++z;
  return *z==0;
}
#endif
