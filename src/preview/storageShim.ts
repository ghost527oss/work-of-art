// @node: F12.7
// The fixed text of the storage stand-in written into a Run-scripts document before any project script runs. A sealed
// frame has no storage of its own, so pages that call localStorage or sessionStorage would crash. This keeps the values
// in memory (strings only, at most 200 keys and 100 KB) and forgets them when the frame closes. No interpolation.
export const STORAGE_SHIM_SOURCE =
  "(function(){var MAXK=200,MAXB=102400,has=Object.prototype.hasOwnProperty;" +
  "function make(){var d=Object.create(null),n=0,b=0;var api={" +
  "getItem:function(k){k=String(k);return has.call(d,k)?d[k]:null}," +
  "setItem:function(k,v){k=String(k);v=String(v);var isNew=!has.call(d,k);var nb=b-(isNew?0:k.length+d[k].length)+k.length+v.length;if((isNew&&n>=MAXK)||nb>MAXB)throw new Error('QuotaExceededError');if(isNew)n++;d[k]=v;b=nb}," +
  "removeItem:function(k){k=String(k);if(has.call(d,k)){b-=k.length+d[k].length;delete d[k];n--}}," +
  "clear:function(){d=Object.create(null);n=0;b=0}," +
  "key:function(i){var ks=Object.keys(d);i=Number(i);return i>=0&&i<ks.length?ks[i]:null}};" +
  "Object.defineProperty(api,'length',{get:function(){return n}});return api}" +
  "['localStorage','sessionStorage'].forEach(function(name){try{Object.defineProperty(window,name,{value:make(),configurable:true})}catch(e){}});})();";
