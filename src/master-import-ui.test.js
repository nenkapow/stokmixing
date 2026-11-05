import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {getMasterCodes} from './master-import-ui.js';
function fakeDb(pages){let index=0;return {from(){return {select(){return this},order(){return this},async range(){return pages[index++]}}}}}
test('membaca seluruh kode master termasuk halaman berikutnya',async()=>{const all=Array.from({length:501},(_,i)=>({code:`K${i}`}));const result=await getMasterCodes(fakeDb([{data:all.slice(0,500),count:501,error:null},{data:all.slice(500),count:501,error:null}]));assert.equal(result.length,501);assert.equal(result[500],'K500')});
test('preview gagal aman jika hitungan master tidak tersedia atau berubah',async()=>{await assert.rejects(getMasterCodes(fakeDb([{data:[],count:null,error:null}])),/tidak tersedia/);await assert.rejects(getMasterCodes(fakeDb([{data:[{code:'K1'}],count:2,error:null},{data:[{code:'K2'}],count:3,error:null}])),/berubah/)});
