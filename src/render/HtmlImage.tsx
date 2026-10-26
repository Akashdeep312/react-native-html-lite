import { useEffect, useState } from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';

import type { HtmlElement } from '../parser/types';

const ALLOWED_SOURCE = /^(?:https?:\/\/|data:image\/)/i;

export function isAllowedImageSource(src: string | undefined): src is string {
  return src !== undefined && ALLOWED_SOURCE.test(src.trim());
}

function toDimension(value: unknown): number | undefined {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\s*\d+(\.\d+)?\s*(px)?\s*$/i.test(value)
        ? parseFloat(value)
        : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

interface HtmlImageProps {
  node: HtmlElement;
  /** Resolved style. Numeric `width`/`height` take precedence over attributes. */
  style: ImageStyle;
}

/**
 * Renders `<img>` as a block that fills the available width (capped at the
 * intrinsic width) while keeping its aspect ratio. Only `http(s):` and
 * `data:image/` sources are loaded.
 */
export function HtmlImage({ node, style }: HtmlImageProps) {
  const src = node.attributes.src?.trim();
  const width = toDimension(style.width) ?? toDimension(node.attributes.width);
  const height =
    toDimension(style.height) ?? toDimension(node.attributes.height);
  const knownRatio = width && height ? width / height : undefined;

  const [measured, setMeasured] = useState<
    { src: string; width: number; ratio: number } | undefined
  >();

  useEffect(() => {
    if (knownRatio || !isAllowedImageSource(src)) {
      return undefined;
    }
    let active = true;
    Image.getSize(src).then(
      (size) => {
        if (active && size.width > 0 && size.height > 0) {
          setMeasured({
            src,
            width: size.width,
            ratio: size.width / size.height,
          });
        }
      },
      () => {}
    );
    return () => {
      active = false;
    };
  }, [src, knownRatio]);

  if (!isAllowedImageSource(src)) {
    return null;
  }

  const current = measured?.src === src ? measured : undefined;
  const ratio = knownRatio ?? current?.ratio;
  if (!ratio) {
    return null;
  }

  // Size comes from the aspect ratio; the rest of the style still applies.
  const rest: ImageStyle = { ...style, width: undefined, height: undefined };
  const alt = node.attributes.alt;
  const imageStyle: StyleProp<ImageStyle> = [
    {
      width: '100%',
      maxWidth: width ?? current?.width,
      aspectRatio: ratio,
      alignSelf: 'flex-start',
    },
    rest,
  ];

  return (
    <Image
      source={{ uri: src }}
      style={imageStyle}
      resizeMode="contain"
      accessible={!!alt}
      accessibilityLabel={alt || undefined}
      accessibilityRole="image"
    />
  );
}
