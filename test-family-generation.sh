#!/bin/bash

# Test script for family generation endpoint
# Usage: ./test-family-generation.sh <election_id>

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <election_id>"
  echo "Example: $0 123e4567-e89b-12d3-a456-426614174000"
  exit 1
fi

ELECTION_ID="$1"
API_URL="${API_URL:-http://localhost:3000}"

echo "Testing family generation for election: $ELECTION_ID"
echo "API URL: $API_URL"
echo ""

# Call the generate-family endpoint
echo "Calling POST /generate-family..."
curl -X POST "$API_URL/generate-family" \
  -H "Content-Type: application/json" \
  -d "{\"election_id\": \"$ELECTION_ID\"}" \
  -w "\nHTTP Status: %{http_code}\n" \
  -s | jq '.'

echo ""
echo "Family generation request completed!"
echo ""
echo "To verify results, run these SQL queries:"
echo ""
echo "-- Check families created"
echo "SELECT booth_id, COUNT(*) as family_count, SUM(member_count) as total_members"
echo "FROM families WHERE election_id = '$ELECTION_ID' GROUP BY booth_id;"
echo ""
echo "-- Check voter assignments"
echo "SELECT COUNT(*) as total, COUNT(family_id) as assigned FROM voters WHERE election_id = '$ELECTION_ID';"
