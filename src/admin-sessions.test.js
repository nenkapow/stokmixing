import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {isoPeriod,sessionProgress} from './admin-sessions.js';
test('pekan ISO menggunakan tanggal kalender dan tahun ISO',()=>{assert.equal(isoPeriod('2026-10-30'),'Opname Mixing • Pekan 44/2026');assert.equal(isoPeriod('2021-01-01'),'Opname Mixing • Pekan 53/2020');assert.equal(isoPeriod('2024-12-30'),'Opname Mixing • Pekan 01/2025');assert.equal(isoPeriod('2025-02-30'),'');assert.equal(isoPeriod(''),'')});
test('progres berdasarkan status mesin snapshot',()=>{assert.deepEqual(sessionProgress([{status:'COMPLETED'},{status:'DRAFT'},{status:'COMPLETED'}]),{total:3,completed:2,notRunning:0,handled:2,unfinished:1,percent:67});assert.deepEqual(sessionProgress([]),{total:0,completed:0,notRunning:0,handled:0,unfinished:0,percent:null})});

test('mesin selesai dan tidak jalan dihitung terpisah sebagai ditangani',()=>{assert.deepEqual(sessionProgress([{status:'COMPLETED'},{status:'NOT_RUNNING'},{status:'DRAFT'}]),{total:3,completed:1,notRunning:1,handled:2,unfinished:1,percent:67});assert.equal(sessionProgress([{status:'COMPLETED'},{status:'NOT_RUNNING'}]).percent,100)});
