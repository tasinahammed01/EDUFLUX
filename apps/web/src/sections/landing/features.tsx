"use client";

import { BarChart3, BookOpenCheck, FilePenLine, ScanText, Sparkles, WandSparkles } from "lucide-react";
import Image from "next/image";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

interface FeatureShowcaseItem {
  icon: typeof FilePenLine;
  title: string;
  description: string;
  lightImage: string;
  darkImage: string;
  alt: string;
}

const features: FeatureShowcaseItem[] = [
  {
    icon: FilePenLine,
    title: "Assignment Studio",
    description: "Shape a clear brief, success criteria, and differentiated support without rebuilding your process.",
    lightImage: "/images/assignmentStudio-white.png",
    darkImage: "/images/assignmentStudio-black.png",
    alt: "MENTRA assignment creation interface"
  },
  {
    icon: Sparkles,
    title: "AI Writing Feedback",
    description: "Find patterns worth discussing. You decide what reaches the student and how it is framed.",
    lightImage: "/images/ai-writting-feedback-white.png",
    darkImage: "/images/ai-writting-feedback-dark.png",
    alt: "MENTRA AI writing feedback review"
  },
  {
    icon: ScanText,
    title: "Handwriting OCR",
    description: "Bring paper-based thinking into the same review flow while preserving the original work.",
    lightImage: "/images/hand-written-ocr-white.png",
    darkImage: "/images/hand-written-ocr-dark.png",
    alt: "MENTRA handwritten submission review"
  },
  {
    icon: BookOpenCheck,
    title: "Flashcards",
    description: "Turn lesson material into focused recall practice grounded in what the class has covered.",
    lightImage: "/images/flashcard-white.png",
    darkImage: "/images/flashcard-dark.png",
    alt: "MENTRA adaptive flashcard practice"
  },
  {
    icon: WandSparkles,
    title: "Worksheet Builder",
    description: "Build purposeful practice for this lesson—not another generic template.",
    lightImage: "/images/worksheet-white.png",
    darkImage: "/images/worksheet-dark.png",
    alt: "MENTRA worksheet practice interface"
  },
  {
    icon: BarChart3,
    title: "Student Insights",
    description: "See momentum, misconceptions, and the story behind every score at a glance.",
    lightImage: "/images/student-Insights-white.png",
    darkImage: "/images/student-Insights-dark.png",
    alt: "MENTRA student progress and reporting dashboard"
  }
];

function FeatureScreenshot({ lightImage, darkImage, alt }: { lightImage: string; darkImage: string; alt: string }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  if (!mounted) {
    return (
      <div className="feature-screenshot-container">
        <Image
          src={lightImage}
          alt={alt}
          width={1200}
          height={800}
          className="feature-screenshot"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 70vw"
          priority={false}
        />
      </div>
    );
  }

  const imageSrc = resolvedTheme === "dark" ? darkImage : lightImage;

  return (
    <div className="feature-screenshot-container">
      <Image
        src={imageSrc}
        alt={alt}
        width={1200}
        height={800}
        className="feature-screenshot"
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 70vw"
        priority={false}
      />
    </div>
  );
}

export function Features() {
  return (
    <section id="features" className="features-section">
      <div className="features-layout">
        <header className="features-sticky">
          <p className="section-kicker">One connected workspace</p>
          <h2>Everything a teacher needs.<br/><em>Nothing that gets in the way.</em></h2>
          <p>Each tool follows the work from first prompt to useful next step.</p>
          <div className="feature-progress">
            <span />
            <b aria-live="polite" />
            <small>/ 06</small>
          </div>
        </header>
        <div className="feature-stories">
          {features.map(({ icon: Icon, title, description, lightImage, darkImage, alt }, index) => (
            <article className="feature-story tilt-card" key={title}>
              <div className="feature-story-copy">
                <span>0{index + 1}</span>
                <Icon aria-hidden="true" />
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
              <div className="feature-demo" aria-hidden="true">
                <FeatureScreenshot lightImage={lightImage} darkImage={darkImage} alt={alt} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
