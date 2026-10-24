'use strict';
module.exports=function fixture(XLSX){
 const wb=XLSX.utils.book_new(),sh=XLSX.utils.aoa_to_sheet([
  ['','','暫定人数の合成曲'],['','','作詞：合成 作曲：合成'],[],
  [1,'','左の最初の合成歌詞',2,'','右の最初の合成歌詞'],
  ['','','左の続きの合成歌詞','','','右の続きの合成歌詞'],
  ['A','','左の暫定グループ','B','','右の暫定グループ'],[],
  ['３人','','人数が明示された歌詞',1,'','最後の合成歌詞']
 ]);
 sh['!merges']=[XLSX.utils.decode_range('A4:A5'),XLSX.utils.decode_range('D4:D5')];
 XLSX.utils.book_append_sheet(wb,sh,'歌割');return wb;
};
