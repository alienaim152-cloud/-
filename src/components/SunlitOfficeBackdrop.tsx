import { useEffect, useState } from 'react';

interface SunlitOfficeBackdropProps {
  mode?: 'terminal' | 'login' | 'admin';
}

export function SunlitOfficeBackdrop({ mode = 'terminal' }: SunlitOfficeBackdropProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const handleMove = (e: MouseEvent) => {
      const nx = (e.clientX / window.innerWidth - 0.5) * -14;
      const ny = (e.clientY / window.innerHeight - 0.5) * -10;
      setOffset({ x: nx, y: ny });
    };

    window.addEventListener('mousemove', handleMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  const scaleClass =
    mode === 'login' ? 'scale-[1.06]' : mode === 'admin' ? 'scale-[1.04]' : 'scale-[1.03]';

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 overflow-hidden pointer-events-none select-none bg-gradient-to-br from-[#eff6ff] via-[#e0f2fe] to-[#fef9c3]/40"
    >
      {!imageFailed && (
        <img
          src="/src/assets/images/modern_sunlit_office_1795351487247.jpg"
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className={`w-full h-full object-cover object-center transition-transform duration-700 ease-out ${scaleClass}`}
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${
              mode === 'login' ? 1.06 : mode === 'admin' ? 1.04 : 1.03
            })`,
          }}
        />
      )}

      {/* Subtle warm sunlight & sky atmospheric scrim preserving desk/window clarity */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, rgba(255, 253, 245, 0.14) 0%, rgba(240, 249, 255, 0.08) 48%, rgba(224, 242, 254, 0.18) 100%)',
        }}
      />

      {/* Soft top-left window sunbeam highlight */}
      <div
        className="absolute -top-24 -left-24 w-[55vw] h-[55vw] rounded-full opacity-50 blur-3xl"
        style={{
          background: 'radial-gradient(circle, rgba(254, 249, 195, 0.65) 0%, rgba(255, 255, 255, 0) 70%)',
        }}
      />

      {/* Subtle bottom-right sky glass caustic */}
      <div
        className="absolute -bottom-32 -right-24 w-[45vw] h-[45vw] rounded-full opacity-40 blur-3xl"
        style={{
          background: 'radial-gradient(circle, rgba(186, 230, 253, 0.55) 0%, rgba(255, 255, 255, 0) 70%)',
        }}
      />
    </div>
  );
}
