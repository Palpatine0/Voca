import { Tabs } from 'expo-router';
import React from 'react';
import { AuthGate } from '../../src/components/AuthGate';
import { useGlassTabBarOptions } from '../../src/components/GlassTabBar';
import { RoundedTabIcon } from '../../src/components/RoundedTabIcon';
import { DeckProvider } from '../../src/context/DeckContext';

export default function TabsLayout() {
  const tabBarOptions = useGlassTabBarOptions();

  return (
    <AuthGate>
      <DeckProvider>
        <Tabs screenOptions={tabBarOptions}>
          <Tabs.Screen
            name="index"
            options={{
              title: 'Home',
              tabBarIcon: ({ color, focused }) => (
                <RoundedTabIcon name="home" focused={focused} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="add"
            options={{
              title: 'Add',
              tabBarIcon: ({ color, focused }) => (
                <RoundedTabIcon name="add" focused={focused} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="library"
            options={{
              title: 'Library',
              tabBarIcon: ({ color, focused }) => (
                <RoundedTabIcon name="library" focused={focused} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: 'Settings',
              tabBarIcon: ({ color, focused }) => (
                <RoundedTabIcon name="settings" focused={focused} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="review"
            options={{
              href: null,
            }}
          />
        </Tabs>
      </DeckProvider>
    </AuthGate>
  );
}
