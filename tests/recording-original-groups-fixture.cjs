'use strict';
module.exports=function(XLSX){
 const wb=XLSX.utils.book_new(),rows=Array.from({length:14},()=>[]);
 rows[0]=['','','合成の暫定歌割'];rows[1]=['','','作詞：合成 作曲：合成'];
 for(let i=0;i<5;i++)rows[9+i]=[i===0||i===3?1:'','','ソロの合成歌詞'+i];
 rows[9].push(1,'','別セクションのソロ');rows[10].push('','','同じ歌割の続き');rows[11].push('A','','合成ユニゾン');rows[12].push(1,'','以前OK済みの歌詞');
 const sh=XLSX.utils.aoa_to_sheet(rows);sh['!merges']=['A10:A12','A13:A14','D10:D11'].map(XLSX.utils.decode_range);
 XLSX.utils.book_append_sheet(wb,sh,'歌割');return wb;
};
