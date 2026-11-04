import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';

import { colors, typography } from '../../theme';

type Variant = keyof typeof typography;
type ColorKey = keyof typeof colors;

interface Props extends TextProps {
  variant?: Variant;
  color?: ColorKey | string;
  align?: TextStyle['textAlign'];
  children?: React.ReactNode;
}

export function AppText({ variant = 'body', color = 'text', align, style, children, ...rest }: Props) {
  const resolved = (colors as Record<string, string>)[color] ?? color;
  return (
    <Text {...rest} style={[typography[variant], { color: resolved }, align ? { textAlign: align } : null, style]}>
      {children}
    </Text>
  );
}
