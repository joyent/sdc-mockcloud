#!/bin/bash

#set -o xtrace

log=/var/log/unsupported-mock-zpool.log

echo "MOCKCN_SERVER_UUID=${MOCKCN_SERVER_UUID}" >> ${log}
if [[ -z ${MOCKCN_SERVER_UUID} ]]; then
    echo "MISSING MOCKCN_SERVER_UUID"
    exit 2
fi
echo "zpool $*" >> ${log}

function unsupported()
{
    echo "UNSUPPORTED[$*]" >> ${log}
    exit 1
}

if [[ "$*" == "list -H -o name,size,allocated,free,cap,health,altroot" ]]; then
    # zones	39.8G	27.7G	12.0G	69%	ONLINE	-
    echo "zones	39.8G	27.7G	12.0G	69%	ONLINE	-"
elif [[ "$*" == "list -H -o size -p zones" ]]; then
    total=$(json capacity < /mockcn/${MOCKCN_SERVER_UUID}/pool.json)
    echo "${total}"
else
    unsupported
fi

exit 0