'use client';

import { useState } from 'react';
import Image from 'next/image';

interface PlayerAvatarProps {
  src: string;
  alt: string;
  className: string; // wrapper div classes — must include relative, overflow-hidden, rounded-full
  sizes?: string;
  skeletonClassName?: string; // override skeleton color, default: bg-slate-200
}

/**
 * Avatar de jugador con skeleton animado mientras carga la imagen.
 * Reemplaza el patrón <div className="..."><Image .../></div> con fade-in.
 */
export default function PlayerAvatar({ src, alt, className, sizes = '48px', skeletonClassName = 'bg-slate-300' }: PlayerAvatarProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className={className}>
      {!loaded && <div className={`absolute inset-0 animate-pulse ${skeletonClassName}`} />}
      <Image
        src={src}
        alt={alt}
        fill
        className={`object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        sizes={sizes}
        unoptimized
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      />
    </div>
  );
}
