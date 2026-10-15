// Official page parser; only the independently reviewed 2026/27 support domain.
import {FED_CALENDAR_URL,FED_MEETINGS,realDay} from './qualified-fed-path.mjs';
const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
const plain=s=>s.replace(/<[^>]*>/gu,' ').replace(/&nbsp;|&#160;/giu,' ').replace(/&ndash;|&#8211;/giu,'-').replace(/\s+/gu,' ').trim();
function require(ok,reason){if(!ok)throw Error(reason);}
export function parseReviewedFomcCalendar(html,checkedAt){
 require(typeof html==='string'&&Buffer.byteLength(html)<=1048576,'calendar_body_invalid');
 const clean=html.replace(/<!--[\s\S]*?-->/gu,'').replace(/<script\b[\s\S]*?<\/script>/giu,'');
 const headings=[...clean.matchAll(/<h4\b[^>]*>\s*<a\b[^>]*>(\d{4}) FOMC Meetings<\/a>\s*<\/h4>/giu)];
 const years={};
 for(const year of Object.keys(FED_MEETINGS)){
  const matches=headings.filter(m=>m[1]===year);require(matches.length===1,'calendar_year_heading_invalid');
  const header=matches[0],next=headings.find(m=>m.index>header.index),section=clean.slice(header.index+header[0].length,next?.index??clean.length);
  const rowCount=[...section.matchAll(/<div\b[^>]*class=["']([^"']*)["'][^>]*>/giu)].filter(m=>m[1].split(/\s+/u).includes('fomc-meeting')).length;
  const monthCount=[...section.matchAll(/class=["'][^"']*\bfomc-meeting__month\b/giu)].length;
  const dateCount=[...section.matchAll(/class=["'][^"']*\bfomc-meeting__date\b/giu)].length;
  const pairs=[...section.matchAll(/<div\b[^>]*class=["'][^"']*\bfomc-meeting__month\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*class=["'][^"']*\bfomc-meeting__date\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/giu)];
  require(rowCount===8&&monthCount===8&&dateCount===8&&pairs.length===8,'calendar_meeting_enumeration_incomplete');
  const dates=pairs.map(pair=>{
   const month=months.indexOf(plain(pair[1]))+1,range=plain(pair[2]).match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})\*?$/u);
   require(month>0&&range&&Number(range[2])===Number(range[1])+1,'calendar_date_unparsed');
   const date=`${year}-${String(month).padStart(2,'0')}-${String(range[2]).padStart(2,'0')}`;
   require(realDay(date),'calendar_date_invalid');return date;
  });
  require(JSON.stringify(dates)===JSON.stringify(FED_MEETINGS[year].map(d=>`${year}-${d}`)),'calendar_schedule_changed');
  years[year]=dates;
 }
 const updates=[...plain(clean).matchAll(/Last Update:\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/gu)];
 require(updates.length===1,'calendar_last_update_missing');
 const [,month,day,year]=updates[0],m=months.indexOf(month)+1;
 const lastUpdated=`${year}-${String(m).padStart(2,'0')}-${day.padStart(2,'0')}`;
 require(m>0&&realDay(lastUpdated),'calendar_last_update_invalid');
 return {sourceUrl:FED_CALENDAR_URL,checkedAt,lastUpdated,years};
}
