'use client';

import React, { useEffect } from 'react';
import dynamic from 'next/dynamic';

const Agentation = dynamic(
  () => import('agentation').then((mod) => mod.Agentation),
  { ssr: false }
);

export default function AgentationProvider() {
  useEffect(() => {
    const handleToggle = () => {
      const toggleBtn =
        (document.querySelector('div[title="Start feedback mode"]') as HTMLElement) ||
        (document.querySelector('div[title="Exit feedback mode"]') as HTMLElement) ||
        (document.querySelector('div[class*="toolbarContainer"]') as HTMLElement);
      if (toggleBtn) {
        toggleBtn.click();
      }
    };

    window.addEventListener('agentation:toggle', handleToggle);
    return () => window.removeEventListener('agentation:toggle', handleToggle);
  }, []);

  return (
    <Agentation
      endpoint={process.env.NEXT_PUBLIC_AGENTATION_ENDPOINT || 'http://localhost:4747'}
      copyToClipboard={true}
      onAnnotationAdd={(ann) => {
        window.dispatchEvent(new CustomEvent('agentation:updated', { detail: ann }));
      }}
      onAnnotationDelete={(ann) => {
        window.dispatchEvent(new CustomEvent('agentation:updated', { detail: ann }));
      }}
      onSubmit={(output, annotations) => {
        window.dispatchEvent(new CustomEvent('agentation:submitted', { detail: { output, annotations } }));
      }}
    />
  );
}

