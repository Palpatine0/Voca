import React from 'react';
import { Platform } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

type TabIconName = 'home' | 'add' | 'library' | 'settings';

interface Props {
  name: TabIconName;
  color: string;
  focused: boolean;
  size?: number;
}

// Curved silhouettes keep the filled and outline states equally soft.
const paths = {
  home: 'M3 10.8 Q3 10 3.65 9.45 L10.55 3.8 Q12 2.6 13.45 3.8 L20.35 9.45 Q21 10 21 10.8 V18.7 Q21 21 18.7 21 H15 V15.8 Q15 14 13.2 14 H10.8 Q9 14 9 15.8 V21 H5.3 Q3 21 3 18.7 Z',
  library: 'M11 6.3 C8.8 4.8 6.2 4.3 3.5 4.7 Q2.75 4.8 2.75 5.65 V18 Q2.75 18.8 3.55 18.7 C6.2 18.3 8.8 18.85 11 20.2 Z M13 6.3 C15.2 4.8 17.8 4.3 20.5 4.7 Q21.25 4.8 21.25 5.65 V18 Q21.25 18.8 20.45 18.7 C17.8 18.3 15.2 18.85 13 20.2 Z',
  settings: 'M10.4 2.75 H13.6 Q14.45 2.75 14.55 3.6 L14.75 5.2 Q15.6 5.55 16.3 6.1 L17.85 5.5 Q18.6 5.2 19.05 6 L20.65 8.8 Q21.08 9.53 20.4 10.05 L19.15 11 Q19.25 12 19.15 13 L20.4 13.95 Q21.08 14.47 20.65 15.2 L19.05 18 Q18.6 18.8 17.85 18.5 L16.3 17.9 Q15.6 18.45 14.75 18.8 L14.55 20.4 Q14.45 21.25 13.6 21.25 H10.4 Q9.55 21.25 9.45 20.4 L9.25 18.8 Q8.4 18.45 7.7 17.9 L6.15 18.5 Q5.4 18.8 4.95 18 L3.35 15.2 Q2.92 14.47 3.6 13.95 L4.85 13 Q4.75 12 4.85 11 L3.6 10.05 Q2.92 9.53 3.35 8.8 L4.95 6 Q5.4 5.2 6.15 5.5 L7.7 6.1 Q8.4 5.55 9.25 5.2 L9.45 3.6 Q9.55 2.75 10.4 2.75 Z M15.3 12 A3.3 3.3 0 1 0 8.7 12 A3.3 3.3 0 1 0 15.3 12 Z',
};

export function RoundedTabIcon({ name, color, focused, size = 24 }: Props) {
  return <Svg width={size} height={size} viewBox="0 0 24 24"
    {...(Platform.OS === 'web' ? { 'aria-hidden': true, focusable: false } : { accessible: false })}>
    {name === 'add' ? focused
      ? <Path fill={color} fillRule="evenodd" d="M21.5 12 A9.5 9.5 0 1 0 2.5 12 A9.5 9.5 0 1 0 21.5 12 Z M11 7.5 A1 1 0 0 1 13 7.5 V11 H16.5 A1 1 0 0 1 16.5 13 H13 V16.5 A1 1 0 0 1 11 16.5 V13 H7.5 A1 1 0 0 1 7.5 11 H11 Z" />
      : <>
        <Circle cx={12} cy={12} r={9} fill="none" stroke={color} strokeWidth={2} />
        <Path d="M12 7.5 V16.5 M7.5 12 H16.5" stroke={color} strokeWidth={2} strokeLinecap="round" />
      </>
      : <Path d={paths[name]} fill={focused ? color : 'none'} fillRule="evenodd" stroke={color}
        strokeWidth={focused ? 1.5 : 2} strokeLinecap="round" strokeLinejoin="round" />}
  </Svg>;
}
