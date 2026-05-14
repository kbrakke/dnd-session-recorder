# Component Unit Tests

This directory contains unit tests for the session detail components.

## Testing Approach

The session components are designed to be testable in isolation:
- Each component has a single responsibility
- Props are well-typed with TypeScript interfaces
- Components are pure presentation (no direct API calls)
- Theme configuration is passed as props

## Test Setup

To add unit tests for React components, you would typically use:
- **React Testing Library** - for component rendering and interaction
- **Jest or Vitest** - as the test runner
- **@testing-library/user-event** - for simulating user interactions

## Example Test Structure

### Testing a Simple Component (ErrorBanner)

```typescript
import { render, screen } from '@testing-library/react';
import { ErrorBanner } from '../error-banner';
import { getTheme } from '../../themes';

describe('ErrorBanner', () => {
  const theme = getTheme('tome');

  it('displays error message', () => {
    render(
      <ErrorBanner
        error="Test error"
        theme={theme}
      />
    );

    expect(screen.getByText('Test error')).toBeInTheDocument();
  });

  it('displays error step when provided', () => {
    render(
      <ErrorBanner
        error="Test error"
        errorStep="transcription"
        theme={theme}
      />
    );

    expect(screen.getByText(/transcription/i)).toBeInTheDocument();
  });

  it('calls onRetry when retry button clicked', () => {
    const onRetry = jest.fn();

    render(
      <ErrorBanner
        error="Test"
        onRetry={onRetry}
        theme={theme}
      />
    );

    const retryButton = screen.getByRole('button', { name: /retry/i });
    retryButton.click();

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('disables retry button when retrying', () => {
    render(
      <ErrorBanner
        error="Test"
        onRetry={() => {}}
        isRetrying={true}
        theme={theme}
      />
    );

    const retryButton = screen.getByRole('button', { name: /retrying/i });
    expect(retryButton).toBeDisabled();
  });
});
```

### Testing a Component with State (ProcessingStep)

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProcessingStep } from '../processing-step';
import { getTheme } from '../../themes';

describe('ProcessingStep', () => {
  const theme = getTheme('tome');

  it('displays label', () => {
    render(
      <ProcessingStep
        label="Upload"
        status="pending"
        isActive={false}
        theme={theme}
      />
    );

    expect(screen.getByText('Upload')).toBeInTheDocument();
  });

  it('shows CheckCircle icon when completed', () => {
    const { container } = render(
      <ProcessingStep
        label="Upload"
        status="complete"
        isActive={false}
        theme={theme}
      />
    );

    // Look for the CheckCircle SVG
    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('shows spinner when active', () => {
    const { container } = render(
      <ProcessingStep
        label="Transcribe"
        status="active"
        isActive={true}
        theme={theme}
      />
    );

    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('calls onStart when start button clicked', async () => {
    const user = userEvent.setup();
    const onStart = jest.fn();

    render(
      <ProcessingStep
        label="Transcribe"
        status="pending"
        isActive={false}
        onStart={onStart}
        theme={theme}
      />
    );

    const startButton = screen.getByTitle('Start Transcribe');
    await user.click(startButton);

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('displays sub-status when active', () => {
    render(
      <ProcessingStep
        label="Transcribe"
        status="active"
        isActive={true}
        subStatus="Chunk 3/10"
        theme={theme}
      />
    );

    expect(screen.getByText('Chunk 3/10')).toBeInTheDocument();
  });

  it('displays progress percentage when provided', () => {
    render(
      <ProcessingStep
        label="Transcribe"
        status="active"
        isActive={true}
        progressPercent={45}
        theme={theme}
      />
    );

    expect(screen.getByText('45%')).toBeInTheDocument();
  });
});
```

### Testing a Component with User Interaction (ThemeSelector)

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeSelector } from '../theme-selector';

describe('ThemeSelector', () => {
  it('displays current theme name', () => {
    render(
      <ThemeSelector
        currentTheme="tome"
        onChange={() => {}}
      />
    );

    expect(screen.getByText('Ancient Tome')).toBeInTheDocument();
  });

  it('calls onChange with next theme when clicked', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();

    render(
      <ThemeSelector
        currentTheme="tome"
        onChange={onChange}
      />
    );

    const button = screen.getByRole('button');
    await user.click(button);

    expect(onChange).toHaveBeenCalledWith('scroll');
  });

  it('cycles through all themes in order', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();

    const { rerender } = render(
      <ThemeSelector
        currentTheme="tome"
        onChange={onChange}
      />
    );

    const button = screen.getByRole('button');
    await user.click(button);
    expect(onChange).toHaveBeenCalledWith('scroll');

    rerender(
      <ThemeSelector
        currentTheme="scroll"
        onChange={onChange}
      />
    );
    await user.click(button);
    expect(onChange).toHaveBeenCalledWith('grimoire');
  });
});
```

## Testing Custom Hooks

For testing custom hooks like `use-session-theme`, you would use `@testing-library/react-hooks`:

```typescript
import { renderHook, act } from '@testing-library/react-hooks';
import { useSessionTheme } from '../../hooks/use-session-theme';

describe('useSessionTheme', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns default theme when no stored value', () => {
    const { result } = renderHook(() => useSessionTheme());
    expect(result.current.theme).toBe('tome');
  });

  it('loads theme from localStorage', () => {
    localStorage.setItem('session-theme', 'grimoire');

    const { result } = renderHook(() => useSessionTheme());
    expect(result.current.theme).toBe('grimoire');
  });

  it('updates theme and persists to localStorage', () => {
    const { result } = renderHook(() => useSessionTheme());

    act(() => {
      result.current.setTheme('scroll');
    });

    expect(result.current.theme).toBe('scroll');
    expect(localStorage.getItem('session-theme')).toBe('scroll');
  });

  it('ignores invalid themes from localStorage', () => {
    localStorage.setItem('session-theme', 'invalid-theme');

    const { result } = renderHook(() => useSessionTheme());
    expect(result.current.theme).toBe('tome'); // Falls back to default
  });
});
```

## Running Tests

Once set up with React Testing Library:

```bash
# Run all unit tests
npm run test:unit

# Run tests in watch mode
npm run test:unit:watch

# Run tests with coverage
npm run test:unit:coverage
```

## Benefits of This Component Architecture

1. **Isolated Testing**: Each component can be tested independently
2. **Mock-Free**: Most tests don't require mocking (just pass theme prop)
3. **Type Safety**: TypeScript ensures correct prop types
4. **Fast**: Unit tests run quickly without network calls
5. **Maintainable**: Small, focused tests that match component size

## Current Test Coverage

- ✅ Theme utilities (themes.spec.ts) - Complete
- ⏳ Component tests - Would require React Testing Library setup
- ⏳ Hook tests - Would require React Hooks Testing Library setup

## Next Steps

To enable React component testing:

1. Install dependencies:
   ```bash
   npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event @testing-library/react-hooks
   ```

2. Configure Jest or Vitest for React components

3. Add test files following the examples above

4. Configure coverage thresholds in package.json
