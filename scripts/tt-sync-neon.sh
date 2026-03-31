#!/bin/bash
# tt-sync-neon — Hourly SQLite→Neon sync during working hours
hour=$(date +%H)
if [ "$hour" -ge 6 ] && [ "$hour" -lt 21 ]; then
    cd /Users/cstacer/Projects/w3geekery/tt
    /usr/local/bin/npx tsx scripts/sync-to-neon.ts >> /tmp/tt-sync-neon.log 2>&1
fi
