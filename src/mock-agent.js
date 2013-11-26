#!/usr/node/bin/node
//--abort_on_uncaught_exception

var async = require('/usr/node/node_modules/async');
var bunyan = require('/usr/node/node_modules/bunyan');
var canned_profiles = require('../lib/canned_profiles.json');
var execFile = require('child_process').execFile;
var fs = require('fs');
var http = require('http');
var path = require('path');
var sprintf = require('/usr/node/node_modules/sprintf').sprintf;
var sys = require('sys');
var UrAgent = require('../ur-agent/ur-agent').UrAgent;

var log = bunyan.createLogger({name: 'mock-ur-agent', level: 'debug'});
var mockCNs = {};
var server;
var state;
var CN_PROPERTIES;
var HTTP_LISTEN_IP = '0.0.0.0';
var HTTP_LISTEN_PORT = 31337;
var MOCKCN_DIR = '/mockcn';
var STATE_FILE = '/mockcn.json';

CN_PROPERTIES = {
    "Boot Time": {validator: isInteger},
    "CPU Physical Cores": {validator: isInteger},
    "CPU Type": {validator: isSimpleString},
    "CPU Virtualization": {validator: isSimpleString},
    "CPU Total Cores": {validator: isInteger},
    "Disks": {validator: isValidDisksObj},
    "Hostname": {validator: isValidHostname},
    "HW Family": {optional: true, validator: isSimpleString},
    "HW Version": {optional: true, validator: isSimpleString},
    "Link Aggregations": {validator: isValidLinkAgg},
    "Live Image": {validator: isPlatformStamp},
    "Manufacturer": {validator: isSimpleString},
    "MiB of Memory": {validator: isInteger}, // XXX convert to string
    "Network Interfaces": {validator: isValidNetObj},
    "Product": {validator: isSimpleString},
    "SDC Version": {validator: isSDCVersion},
    "Serial Number": {validator: isSimpleString},
    "SKU Number": {validator: isSimpleString},
    "System Type": {validator: isSunOS},
    "UUID": {validator: isUUID},
    "Virtual Network Interfaces": {validator: isValidVirtNetObj},
    "VM Capable": {validator: isBoolean}
};

/*
CANNED_HARDWARE_PROFILES = {
    "C2100": {
        "CPU Physical Cores": 2,
        "CPU Total Cores": 16,
        "CPU Type": "Intel(R) Xeon(R) CPU E5530 @ 2.40GHz",
        "CPU Virtualization": "vmx",
        "Disks": {
            "c0t37E44117BC62A1E3d0": {"Size in GB": 597, "PID": "Logical Volume", "VID": "LSI"},
            "c1t0d0": {"Size in GB": 2096, "PID": "PERC H700", "VID": "DELL"}
        },
*/


/*
 * These properties are ignored (they get set for you):
 *
 * "Boot Parameters" // from CNAPI? or TFTP
 * "Datacenter Name"
 * "Setup"
 * "Zpool*"
 *
 */

function genRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function genBootTime() {
    // sysinfo has 'Boot Time' as a string
    return Math.floor(new Date().getTime() / 1000).toString();
}

// Generate a hex representation of a random four byte string.
function genId() {
    return Math.floor(Math.random() * 0xffffffff).toString(16);
}

function isBoolean(v) {
    if (v === true || v === false) {
        return true;
    } else {
        return false;
    }
}

function isInteger(v) {
    if (!isNaN(Number(v)) && (Number(v) % 1) === 0) {
        return true;
    } else {
        return false;
    }
}

function isValidLinkAgg(v) {
    // isValidLinkAgg // for now: {}
    return true;
}

function isValidVirtNetObj(v) {
    // same as NetObj + 'Host Interface', 'VLAN'
    return true;
}

function isValidNetObj(v) {
    // key = e1000g0, fields: 'MAC Address', 'ip4addr', 'Link Status', 'NIC Names'
    return true;
}

function isValidDisksObj(v) {
    // key = devicename, fields: 'Size in GB' = int, XXX
    return true;
}

function isValidHostname(v) {
    if (v.match(/^[a-zA-Z0-9]$/)) {
        return true;
    } else {
        return false;
    }
}

function isPlatformStamp(v) {
    if (v.match(/^[0-9]*T[0-9]*Z$/)) {
        return true;
    } else {
        return false;
    }
}

function isSimpleString(v) {
    if (v.match(/^[a-zA-Z0-9\ \.\,\-\_]*$/)) {
        return true;
    } else {
        return false;
    }
}

function isSunOS(v) {
    return v === 'SunOS';
}

function isSDCVersion(v) {
    if (v.match(/^[0-9]*\.[0-9]*$/)) {
        return true;
    }
    return false;
}

// "borrowed" from VM.js
function isUUID(str) {
    var re = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
    if (str && str.length === 36 && str.match(re)) {
        return true;
    } else {
        return false;
    }
}

function monitorMockCNs() {

    function refreshMockCNs () {
        fs.readdir(MOCKCN_DIR, function (err, files) {
            fileCache = {};

            if (err && err.code === 'ENOENT') {
                log.debug('failed to read ' + MOCKCN_DIR + ': does not exist');
                return;
            } else if (err) {
                log.error('failed to refresh MockCNs: ' + err.message);
                return;
            }

            files.forEach(function (file) {
                fileCache[file] = true;
                if (!mockCNs.hasOwnProperty(file)) {
                    // create an instance for this one
                    log.info('starting instance for mock CN ' + file);
                    mockCNs[file] = new UrAgent({
                        sysinfoFile: '/mockcn/' + file + '/sysinfo.json',
                        setupStateFile: '/mockcn/' + file + '/setup.json',
                        urStartupFilePath: '/tmp/' + file + '.tmp-' + genId(),
                        mockCNServerUUID: file
                    });
                }
            });

            Object.keys(mockCNs).forEach(function (cn) {
                if (!fileCache.hasOwnProperty(cn)) {
                    // remove instance for this one
                    log.info('removing instance for mock CN ' + cn);
                    mockCNs[cn].shutdown();
                    delete mockCNs[cn];
                }
            });
        });
    }

    // Setup fs.watcher for this DIR to add and remove instances when
    fs.watch(MOCKCN_DIR, function () {
        // we don't care about *what* event just happened, just that one did
        refreshMockCNs();
    })

    // call refreshMockCNs() to set the initial mock CNs
    refreshMockCNs();
}

function getTarget(url) {
    var urlParts = url.split('/');

    if (urlParts[0] !== '' || urlParts[1] !== 'servers'
        || urlParts.length > 3) {

        // invalid request
        return null;
    }

    if (urlParts.length === 3) {
        if (isUUID(urlParts[2])) {
            return urlParts[2];
        } else {
            // request was /servers/<junk>
            return null;
        }
    }

    // the request was /servers
    return 'all';
}

function returnError(code, request, res) {
    res.writeHead(code);
    res.end();
}

function validateServer(uuid, cnobj) {
    var invalid = false;
    var validated = {};

    Object.keys(cnobj).forEach(function (key) {
        if (CN_PROPERTIES.hasOwnProperty(key)) {
            if (CN_PROPERTIES[key].validator(cnobj[key])) {
                validated[key] = cnobj[key];
            } else {
                invalid = true;
            }
        } else {
            log.info('Ignoring field ' + key);
        }
    });

    if (cnobj.hasOwnProperty('UUID') && cnobj.UUID !== uuid) {
        log.error('UUID in payload (' + cnobj.UUID + ') does not match target ('
            + uuid + ')');
        return false;
    }

    if (invalid) {
        return false;
    }
    return validated;
}

function getMetadata(key, callback) {
    execFile('/usr/sbin/mdata-get', [key], function (err, stdout, stderr) {
        var result;

        if (err) {
            err.stderr = stderr;
            callback(err);
            return;
        }

        result = stdout.split(/\n/)[0];
        callback(null, result);
    });
}

function getBuildstamp(callback) {
    execFile('/usr/bin/uname', ['-v'], function (err, stdout, stderr) {
        var result;

        if (err) {
            err.stderr = stderr;
            callback(err);
            return;
        }

        result = stdout.split(/\n/)[0];
        result = result.split(/_/)[1];
        callback(null, result);
    });
}

function loadState(callback) {
    fs.readFile(STATE_FILE, function (error, data) {
        var json = {};

        if (error) {
            if (error.code === 'ENOENT') {
                state = {cn_indexes: {}};
                callback();
            } else {
                log.error(error, 'loadJsonConfig() failed to load ' + filename);
                callback(error);
                return;
            }
        } else {
            try {
                json = JSON.parse(data.toString());
                state = json;
                callback();
            } catch (e) {
                log.error(e, 'failed to parse JSON');
                callback(e);
            }
        }
    });
}

function saveState(callback) {
    fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), function (err) {
        if (err) {
            callback(err);
            return;
        }
        callback();
    });
}

function addMAC(nic, mock_oui, cn_index, nic_index, callback) {
    var index_octets;
    index_octets = sprintf("%04x", cn_index).match(/.{2}/g);

    nic['MAC Address']
        = sprintf("%s:%s:%02x", mock_oui, index_octets.join(':'), nic_index);

    log.debug({nic: nic}, 'NIC');

    callback();
}

function applyDefaults(uuid, cnobj, callback) {
    var cn_index;
    var mock_oui;
    var payload = cnobj;

    if (!payload.hasOwnProperty('UUID')) {
        payload.UUID = uuid;
    }

    if (!payload.hasOwnProperty('Boot Time')) {
        payload['Boot Time'] = genBootTime();
    }

    if (!payload.hasOwnProperty('System Type')) {
        payload['System Type'] = 'SunOS';
    }

    if (!payload.hasOwnProperty('SDC Version')) {
        payload['SDC Version'] = '7.0';
    }

    function addFromMetadata(prop, mdata_key, cb) {
        if (payload.hasOwnProperty(prop)) {
            cb();
            return;
        }
        getMetadata(mdata_key, function (e, val) {
            if (!e) {
                payload[prop] = val;
            }
            cb(e);
            return;
        });
    }

    async.series([
        function (cb) {
            addFromMetadata('Datacenter Name', 'sdc:datacenter_name', cb);
        }, function (cb) {
            if (payload.hasOwnProperty('Live Image')) {
                cb();
                return;
            }
            getBuildstamp(function (e, buildstamp) {
                if (!e) {
                     payload['Live Image'] = buildstamp;
                }
                cb(e);
                return;
            });
        }, function (cb) {
            var canned_profile_names;
            var profile;
            var template;

            canned_profile_names = Object.keys(canned_profiles);
            profile = canned_profile_names[genRandomInt(0,
                (canned_profile_names.length - 1))];
            log.debug('chose profile ' + profile);
            template = canned_profiles[profile];

            Object.keys(template).forEach(function (key) {
                if (!payload.hasOwnProperty(key)) {
                    payload[key] = template[key];
                    log.debug('loading ' + key + ' = ' + template[key]);
                } else {
                    log.debug('already have ' + key);
                }
            });
            cb();
        }, function (cb) {
            var next_index = 0;
            var vms;

            // find index for this CN
            vms = Object.keys(state.cn_indexes);
            vms.forEach(function (v) {
                if (v.cn_index >= next_index) {
                    cn_index++;
                }
            });

            cn_index = next_index;
            cb();
        }, function (cb) {
            /*
             * Load the mock_oui, this should be unique for each mockcn VM
             * The generated UUIDs for servers will be:
             *
             *   mock_oui:<server_num>:<nic_num>
             *
             *
             *
             */
            getMetadata('mock_oui', function (e, val) {
                if (!e) {
                    mock_oui = val;
                }
                cb(e);
            });
        }, function (cb) {
            var nic_index = 0;
            var nics;

            nics = Object.keys(payload['Network Interfaces']);

            async.forEach(nics, function (n, c) {
                addMAC(payload['Network Interfaces'][n], mock_oui, cn_index,
                    nic_index++, c);
            }, function (e) {
                cb(e);
            });
        }
    ], function (err) {
        if (err) {
            log.error({err: err}, 'failed!');
        }
        callback(err, payload);
    });

    // XXX TODO: randomize disk names (eg. c0t37E44117BC62A1E3d0)

    // TODO: add MAC addresses to all NICs

    // TODO: set Hostname to admin MAC s/:/-/
}

function createServer(uuid, cnobj, res) {
    var validated;

    log.debug({cnobj: cnobj}, 'creating ' + uuid + ' original payload');

    validated = validateServer(uuid, cnobj);
    if (!validated) {
        returnError(400, {}, res);
        return;
    }

    log.debug({cnobj: validated}, 'validated payload');

    applyDefaults(uuid, validated, function (err, payload) {
        log.debug({cnobj: payload}, 'after applying defaults');
        res.writeHead(201, {
            'Content-Type': 'application/json'
        });
        res.end(JSON.stringify(payload) + '\n');
    });
}

function dumpServers(res) {
    res.writeHead(200, {
        'Content-Type': 'application/json'
    });
    res.end(JSON.stringify([]) + '\n');
}

function dumpServer(uuid, res) {
    res.writeHead(200, {
        'Content-Type': 'application/json'
    });
    res.end(JSON.stringify({uuid: uuid}) + '\n');
}

function deleteServer(uuid, res) {
    log.debug('deleting ' + uuid);
    res.writeHead(200, {
        'Content-Type': 'application/json'
    });
    res.end();
}

/*
 * valid HTTP endpoints:
 *
 * GET /servers
 * GET /servers/:uuid
 * POST /servers/:uuid
 * DELETE /servers/:uuid
 *
 */
function handleHTTPRequest(request, res) {
    var urlParts;
    var target;

    if (request.headers.hasOwnProperty('content-type')
        && request.headers['content-type'] !== 'application/json') {

        returnError(400, request, res);
        return;
    }

    target = getTarget(request.url);
    log.info({
        method: request.method,
        target: request.url,
        remote: request.connection.remoteAddress
     }, 'handling request');

    if (target === null) {
        returnError(404, request, res);
        return;
    }

    if (request.method === 'GET') {
        if (target === 'all') {
            dumpServers(res);
            return;
        } else {
            dumpServer(target, res);
            return;
        }
    } else if (request.method === 'POST') {
        var data = '';

        if (target === 'all') {
            returnError(404, request, res);
            return;
        }

        request.on('data', function(chunk) {
            data += chunk;
        });

        request.on('end', function() {
            var cnobj;

            loadState(function (e) {
                if (e) {
                    returnError(500, request, res);
                    return;
                }
                if (data.length == 0) {
                    createServer(target, {}, res);
                } else {
                    try {
                        cnobj = JSON.parse(data);
                    } catch (e) {
                        log.error({err: e}, 'failed to parse POST input');
                        returnError(400, request, res);
                        return;
                    }
                    createServer(target, cnobj, res);
                }
            });
        });
        return;
    } else if (request.method === 'DELETE') {
        if (target === 'all') {
            returnError(404, request, res);
            return;
        }
        loadState(function (e) {
            if (e) {
                returnError(500, request, res);
                return;
            }
            deleteServer(target, res);
            return;
        });
    } else {
        returnError(404, request, res);
        return;
    }
}

/* XXX this should change to just a startup load */
monitorMockCNs();

/* start HTTP server for controlling mock CN instances */
server = http.createServer(handleHTTPRequest);
server.listen(HTTP_LISTEN_PORT, HTTP_LISTEN_IP);
log.info('Server running at http://' + HTTP_LISTEN_IP + ':'
    + HTTP_LISTEN_PORT + '/');
