/*
 * CDDL HEADER START
 *
 * The contents of this file are subject to the terms of the
 * Common Development and Distribution License, Version 1.0 only
 * (the "License").  You may not use this file except in compliance
 * with the License.
 *
 * You can obtain a copy of the license at http://smartos.org/CDDL
 *
 * See the License for the specific language governing permissions
 * and limitations under the License.
 *
 * When distributing Covered Code, include this CDDL HEADER in each
 * file.
 *
 * If applicable, add the following below this CDDL HEADER, with the
 * fields enclosed by brackets "[]" replaced with your own identifying
 * information: Portions Copyright [yyyy] [name of copyright owner]
 *
 * CDDL HEADER END
 *
 *
 * Copyright (c) 2015, Joyent, Inc. All rights reserved.
 *
 *
 * onlyif utility
 */

/*
 * Example:
 *
 * onlyif.rootInSmartosGlobal(function(err) {
 *     if (err) {
 *         console.log('Fatal: cannot run because: ' + err);
 *         process.exit(1);
 *     }
 *     console.log('hello root in the GZ!');
 * });
 *
 */

exports.rootInSmartosGlobal = function (callback)
{
    if (!process.env.MOCKCN_SERVER_UUID) {
        callback('You must set MOCKCN_SERVER_UUID');
        return;
    }
    // Good luck! You're going to need it!
    callback();
};
