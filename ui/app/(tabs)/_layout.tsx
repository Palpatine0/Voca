import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { AuthGate } from '../../src/components/AuthGate';
import { useGlassTabBarOptions } from '../../src/components/GlassTabBar';
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
                <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="add"
            options={{
              title: 'Add',
              tabBarIcon: ({ color, focused }) => (
                <Ionicons name={focused ? 'add-circle' : 'add-circle-outline'} size={25} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="library"
            options={{
              title: 'Library',
              tabBarIcon: ({ color, focused }) => (
                <Ionicons name={focused ? 'book' : 'book-outline'} size={24} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: 'Settings',
              tabBarIcon: ({ color, focused }) => (
                <Ionicons name={focused ? 'settings' : 'settings-outline'} size={24} color={color} />
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
