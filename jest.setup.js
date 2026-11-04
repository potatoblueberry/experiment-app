// Jest setup: in-memory AsyncStorage and a Node-backed UUID so the repository can be tested without a device.
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-crypto', () => ({ randomUUID: () => require('crypto').randomUUID() }));
