import { ComponentPropsWithoutRef, useEffect, useMemo, useRef, useState } from 'react';
import { getProductEmoji } from '../lib/productEmoji';

interface SmartImageProps extends Omit<ComponentPropsWithoutRef<'img'>, 'src' | 'alt'> {
  src?: string;
  alt?: string;
  fallbackLabel?: string;
  fallbackCategory?: string;
}

const PROXIED_IMAGE_HOSTS = new Set(['images.unsplash.com', 'plus.unsplash.com']);

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildFallbackDataUri(label: string, category?: string) {
  const safeLabel = escapeXml(label.trim().slice(0, 28) || 'Frutaria em Casa');
  const emoji = escapeXml(getProductEmoji(label, category));
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" role="img" aria-label="${safeLabel}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fff2d8"/>
          <stop offset="100%" stop-color="#ffe3bf"/>
        </linearGradient>
      </defs>
      <rect width="320" height="320" rx="36" fill="url(#bg)"/>
      <circle cx="85" cy="86" r="42" fill="#ff6b00" opacity="0.16"/>
      <circle cx="264" cy="248" r="58" fill="#2ecc71" opacity="0.14"/>
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif" font-size="140">${emoji}</text>
      <text x="50%" y="82%" text-anchor="middle" font-family="Outfit, Arial, sans-serif" font-size="22" font-weight="700" fill="#7a3d00">${safeLabel}</text>
      <text x="50%" y="92%" text-anchor="middle" font-family="Outfit, Arial, sans-serif" font-size="10" font-weight="700" letter-spacing="3" fill="#ff6b00">FRUTARIA EM CASA</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function resolveImageSource(source: string | undefined, placeholderSrc: string) {
  if (typeof source !== 'string' || source.trim().length === 0) {
    return placeholderSrc;
  }

  const trimmedSource = source.trim();
  if (
    trimmedSource.startsWith('data:')
    || trimmedSource.startsWith('blob:')
    || trimmedSource.startsWith('file:')
  ) {
    return trimmedSource;
  }

  try {
    const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const parsedUrl = new URL(trimmedSource, baseOrigin);

    if (parsedUrl.origin !== baseOrigin && PROXIED_IMAGE_HOSTS.has(parsedUrl.hostname.toLowerCase())) {
      return `/api/image-proxy?url=${encodeURIComponent(parsedUrl.toString())}`;
    }

    return trimmedSource;
  } catch {
    return trimmedSource;
  }
}

export default function SmartImage({ src, alt, fallbackLabel, fallbackCategory, onError, ...props }: SmartImageProps) {
  const resolvedLabel = fallbackLabel || alt || 'Frutaria em Casa';
  const placeholderSrc = useMemo(
    () => buildFallbackDataUri(resolvedLabel, fallbackCategory),
    [resolvedLabel, fallbackCategory],
  );
  const resolvedSrc = useMemo(() => {
    const baseSource = resolveImageSource(src, placeholderSrc);
    if (!baseSource.startsWith('/api/image-proxy?url=')) {
      return baseSource;
    }

    const proxied = `${baseSource}&label=${encodeURIComponent(resolvedLabel)}`;
    return fallbackCategory ? `${proxied}&category=${encodeURIComponent(fallbackCategory)}` : proxied;
  }, [placeholderSrc, resolvedLabel, fallbackCategory, src]);
  const [currentSrc, setCurrentSrc] = useState(resolvedSrc);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setCurrentSrc(resolvedSrc);
  }, [resolvedSrc]);

  useEffect(() => {
    const image = imageRef.current;
    if (!image || currentSrc === placeholderSrc) {
      return undefined;
    }

    const applyFallback = () => {
      if (image.naturalWidth === 0) {
        setCurrentSrc(placeholderSrc);
      }
    };

    if (image.complete) {
      applyFallback();
      return undefined;
    }

    image.addEventListener('error', applyFallback);
    image.addEventListener('load', applyFallback);

    return () => {
      image.removeEventListener('error', applyFallback);
      image.removeEventListener('load', applyFallback);
    };
  }, [currentSrc, placeholderSrc]);

  return (
    <img
      {...props}
      alt={alt}
      ref={imageRef}
      src={currentSrc}
      onError={(event) => {
        if (currentSrc !== placeholderSrc) {
          setCurrentSrc(placeholderSrc);
        }
        onError?.(event);
      }}
    />
  );
}