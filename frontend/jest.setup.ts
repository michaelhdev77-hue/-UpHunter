import '@testing-library/jest-dom';

// Mock window.open
Object.defineProperty(window, 'open', { value: jest.fn(), writable: true });

// Mock window.confirm
Object.defineProperty(window, 'confirm', { value: jest.fn(() => true), writable: true });
