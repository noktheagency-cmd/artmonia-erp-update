type TopicInput = { id:string; sequence:number; title:string; materials:Array<{id:string;subject:string;objective:string;homework:string;imageUrl:string|null}> };
type AttendanceInput = {status:"PRESENT"|"ABSENT"|"EXCUSED";markedAt:Date;sessionDate:Date;startTime:string};
export function calculateMobileJourneyAndGamification(input:{programId:string;courseCode:string|null;topics:TopicInput[];attendance:AttendanceInput[]}) {
  const present=input.attendance.filter(r=>r.status==="PRESENT").toSorted((a,b)=>a.sessionDate.getTime()-b.sessionDate.getTime()||a.startTime.localeCompare(b.startTime));
  const ordered=input.topics.toSorted((a,b)=>a.sequence-b.sequence);
  const completedTopicCount=Math.min(present.length,ordered.length);
  const topics=ordered.map((topic,index)=>{
    const status=index<completedTopicCount?"completed" as const:index===completedTopicCount?"current" as const:"locked" as const;
    const access=status!=="locked"?status:index<=completedTopicCount+3?"preview" as const:"locked" as const;
    return {identifier:"program:"+input.programId+":topic:"+topic.id,number:topic.sequence,title:topic.title,courseCode:input.courseCode,
      status,access,canViewMaterials:access!=="locked",completedAt:status==="completed"?present[index].markedAt.toISOString():null,
      materials:access==="locked"?[]:topic.materials};
  });
  return {journey:{topics,currentTopic:topics.find(t=>t.status==="current")??null,completedTopicCount,totalTopicCount:topics.length,
    progressPercent:topics.length?Math.round(completedTopicCount/topics.length*100):0}};
}
