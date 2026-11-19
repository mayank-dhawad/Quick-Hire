#!/usr/bin/env bash
# ============================================================================
# QUICKHIRE TWO-SESSION CONCURRENCY TEST RUNNER (Bash)
# File: supabase/tests/concurrency_runner.sh
# ============================================================================

set -euo pipefail

DB_URL="${1:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

run_scenario() {
  local name="$1"
  local s1_file="$2"
  local s2_file="$3"

  echo ""
  echo "================================================================"
  echo "SCENARIO: $name"
  echo "================================================================"

  echo "[1/3] Starting Session 1 (acquiring lock and holding in-flight)..."
  psql "$DB_URL" -f "$s1_file" > /tmp/s1.log 2>&1 &
  local s1_pid=$!

  sleep 1.5

  echo "[2/3] Starting Session 2 (attempting concurrent mutation; should block)..."
  psql "$DB_URL" -f "$s2_file" > /tmp/s2.log 2>&1 || true

  wait $s1_pid

  echo "---------------- Session 1 Output ----------------"
  cat /tmp/s1.log
  echo "---------------- Session 2 Output ----------------"
  cat /tmp/s2.log
  echo "--------------------------------------------------"

  if grep -q "COMMITTED SUCCESSFULLY" /tmp/s1.log && grep -q -E "(23514|Capacity Exceeded|Overpayment Violation|Refund Violation)" /tmp/s2.log; then
    echo -e "\033[0;32m[SUCCESS] $name PASSED!\033[0m"
  else
    echo -e "\033[0;31m[FAILURE] $name FAILED!\033[0m"
    exit 1
  fi
}

run_scenario "Job Capacity & Simultaneous Hiring" \
  "$SCRIPT_DIR/03_concurrency_session1.sql" \
  "$SCRIPT_DIR/03_concurrency_session2.sql"

run_scenario "Payment Overpayment Prevention" \
  "$SCRIPT_DIR/04_concurrency_payments_s1.sql" \
  "$SCRIPT_DIR/04_concurrency_payments_s2.sql"

run_scenario "Child Refund Limits" \
  "$SCRIPT_DIR/05_concurrency_refunds_s1.sql" \
  "$SCRIPT_DIR/05_concurrency_refunds_s2.sql"

echo ""
echo -e "\033[0;32m================================================================\033[0m"
echo -e "\033[0;32mALL 3 CONCURRENCY SUITES PASSED CLEANLY UNDER PARALLEL SESSIONS\033[0m"
echo -e "\033[0;32m================================================================\033[0m"
