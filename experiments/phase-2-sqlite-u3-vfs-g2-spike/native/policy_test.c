#include <assert.h>
#include <stdio.h>
#include "fault_policy.h"
int main(void) {
  ApvGate g={1,0,1,1,1,123,456}, bad; int n=0;
#define CHECK(v) do { assert(v); ++n; } while(0)
#define HIT(gate,m,k,p,b,t,pid,thr) apv_should_fault(&(gate),m,k,p,b,t,pid,thr)
  CHECK(HIT(g,1,2,1,1,1,123,456)); CHECK(!HIT(g,2,2,1,1,1,123,456));
  CHECK(!HIT(g,1,1,1,1,1,123,456)); CHECK(!HIT(g,1,2,0,1,1,123,456));
  CHECK(!HIT(g,1,2,1,0,1,123,456)); CHECK(!HIT(g,1,2,1,1,0,123,456));
  CHECK(!HIT(g,1,2,1,1,1,999,456)); CHECK(!HIT(g,1,2,1,1,1,123,999));
  bad=g;bad.armed=0;CHECK(!HIT(bad,1,2,1,1,1,123,456));
  bad=g;bad.spent=1;CHECK(!HIT(bad,1,2,1,1,1,123,456));
  bad=g;bad.commitActive=0;CHECK(!HIT(bad,1,2,1,1,1,123,456));
  bad=g;bad.commitSerial=2;CHECK(!HIT(bad,1,2,1,1,1,123,456));
  bad=g;bad.mode=2;CHECK(HIT(bad,2,2,1,1,1,123,456));
  CHECK(apv_commit_sql("COMMIT"));CHECK(apv_commit_sql(" commit;\r\n"));
  CHECK(!apv_commit_sql("COMMITMENT"));CHECK(!apv_commit_sql("COMMIT; PRAGMA wal_checkpoint"));
  CHECK(!apv_commit_sql("ROLLBACK"));CHECK(!apv_commit_sql("--COMMIT"));CHECK(!apv_commit_sql(NULL));
  printf("Native policy pure checks: %d PASS; no SQLite or DLL loaded\n",n);return 0;
}
