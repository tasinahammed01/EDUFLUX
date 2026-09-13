import { BarChart3, BookOpenCheck, FilePenLine, ScanText, Sparkles, WandSparkles } from "lucide-react";

const features = [
  { icon: FilePenLine, title: "Assignment Studio", copy: "Shape a clear brief, success criteria, and differentiated support without rebuilding your process.", demo: <div className="demo-composer"><span>Essay brief</span><i /><i /><button>Publish assignment</button></div> },
  { icon: Sparkles, title: "AI Writing Feedback", copy: "Find patterns worth discussing. You decide what reaches the student and how it is framed.", demo: <div className="demo-feedback"><p>The argument is clear, but this evidence needs a closer link.</p><span>Teacher review</span></div> },
  { icon: ScanText, title: "Handwriting OCR", copy: "Bring paper-based thinking into the same review flow while preserving the original work.", demo: <div className="demo-scan"><i>Student notebook</i><span>Text captured</span></div> },
  { icon: BookOpenCheck, title: "Flashcards", copy: "Turn lesson material into focused recall practice grounded in what the class has covered.", demo: <div className="demo-flash"><small>CAUSE → EFFECT</small><strong>Why did the policy change?</strong></div> },
  { icon: WandSparkles, title: "Worksheet Builder", copy: "Build purposeful practice for this lesson—not another generic template.", demo: <div className="demo-sheet"><span>3 sections</span><span>12 questions</span><i /></div> },
  { icon: BarChart3, title: "Student Insights", copy: "See momentum, misconceptions, and the story behind every score at a glance.", demo: <div className="demo-signal"><i style={{height:"38%"}}/><i style={{height:"58%"}}/><i style={{height:"48%"}}/><i style={{height:"82%"}}/><i style={{height:"94%"}}/></div> }
];

export function Features() {
  return <section id="features" className="features-section"><div className="features-layout"><header className="features-sticky"><p className="section-kicker">One connected workspace</p><h2>Everything a teacher needs.<br/><em>Nothing that gets in the way.</em></h2><p>Each tool follows the work from first prompt to useful next step.</p><div className="feature-progress"><span /><b aria-live="polite" /><small>/ 06</small></div></header><div className="feature-stories">{features.map(({icon:Icon,title,copy,demo},index)=><article className="feature-story tilt-card" key={title}><div className="feature-story-copy"><span>0{index+1}</span><Icon aria-hidden="true"/><h3>{title}</h3><p>{copy}</p></div><div className="feature-demo" aria-hidden="true">{demo}</div></article>)}</div></div></section>;
}
