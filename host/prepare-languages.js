// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const fs=require('node:fs'),path=require('node:path');
const {entries}=require('../public/languages');
const target=path.join(__dirname,'../public/host-languages.json');
fs.writeFileSync(target,JSON.stringify(entries));
console.log('Published shared launcher language dictionary.');
