import React, { useCallback, useEffect, useState } from 'react';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import { useTheme } from '../../context/ThemeContext';

// Module-level singleton — engine must only be initialized once
let engineInitialized = false;
let engineInitPromise = null;

const ParticleBackground = () => {
  const [engineReady, setEngineReady] = useState(engineInitialized);
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Detect reduced motion preference
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Detect low-end device
  const isLowEnd =
    typeof navigator !== 'undefined' &&
    navigator.hardwareConcurrency != null &&
    navigator.hardwareConcurrency < 4;

  const isMobile =
    typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => {
    if (prefersReducedMotion) return;
    if (engineInitialized) { setEngineReady(true); return; }
    if (!engineInitPromise) {
      engineInitPromise = initParticlesEngine(async (engine) => {
        await loadSlim(engine);
      });
    }
    engineInitPromise.then(() => {
      engineInitialized = true;
      setEngineReady(true);
    });
  }, [prefersReducedMotion]);

  const particlesLoaded = useCallback(() => {}, []);

  if (prefersReducedMotion || !engineReady) {
    return null; // CSS gradient background shows through
  }

  const particleCount = isLowEnd || isMobile ? 20 : 50;
  const enableLinks = !isLowEnd && !isMobile;

  // Some nodes are "bright" (engaged students), some dim — classroom metaphor
  const primaryColor = isDark ? '#818CF8' : '#4F46E5';
  const secondaryColor = isDark ? '#2dd4bf' : '#14b8a6';

  return (
    <Particles
      id="landing-particles"
      className="absolute inset-0 w-full h-full"
      particlesLoaded={particlesLoaded}
      options={{
        fpsLimit: 60,
        interactivity: {
          events: {
            onHover: { enable: !isMobile, mode: 'grab' },
            onClick: { enable: false },
            resize: true,
          },
          modes: {
            grab: { distance: 120, links: { opacity: 0.4 } },
          },
        },
        particles: {
          number: {
            value: particleCount,
            density: { enable: true, area: 800 },
          },
          color: {
            value: [primaryColor, secondaryColor, '#6366F1'],
          },
          links: {
            enable: enableLinks,
            color: isDark ? '#818CF8' : '#4F46E5',
            opacity: isDark ? 0.15 : 0.12,
            distance: 140,
            width: 1,
          },
          move: {
            enable: true,
            speed: 0.5,
            direction: 'none',
            random: true,
            straight: false,
            outModes: { default: 'out' },
          },
          opacity: {
            value: { min: 0.2, max: 0.7 },
            animation: {
              enable: true,
              speed: 0.8,
              minimumValue: 0.15,
              sync: false,
            },
          },
          size: {
            value: { min: 1.5, max: 3.5 },
          },
          shape: { type: 'circle' },
        },
        detectRetina: true,
        background: { color: 'transparent' },
      }}
    />
  );
};

export default React.memo(ParticleBackground);
