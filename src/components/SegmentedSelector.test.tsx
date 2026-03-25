import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedSelector } from './SegmentedSelector';

function createDeferred() {
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((_, rejectPromise) => {
    reject = rejectPromise;
  });

  return { promise, reject };
}

function ControlledHarness() {
  const [value, setValue] = useState<'left' | 'right'>('left');

  return (
    <>
      <SegmentedSelector
        ariaLabel="테스트 선택"
        value={value}
        options={[
          { value: 'left', label: '왼쪽' },
          { value: 'right', label: '오른쪽' },
        ]}
        onChange={async (nextValue) => {
          setValue(nextValue);
        }}
      />
      <span data-testid="current-value">{value}</span>
    </>
  );
}

describe('SegmentedSelector', () => {
  it('changes selection on click', async () => {
    render(<ControlledHarness />);

    await userEvent.click(screen.getByRole('radio', { name: '오른쪽' }));

    expect(screen.getByTestId('current-value')).toHaveTextContent('right');
    expect(screen.getByRole('radio', { name: '오른쪽' })).toHaveAttribute('aria-checked', 'true');
  });

  it('supports keyboard navigation', async () => {
    render(<ControlledHarness />);

    await userEvent.tab();
    await userEvent.keyboard('{ArrowRight}');

    expect(screen.getByRole('radio', { name: '오른쪽' })).toHaveAttribute('aria-checked', 'true');
  });

  it('applies visual selection immediately and reverts on async failure', async () => {
    const deferred = createDeferred();
    const onChange = vi.fn(() => deferred.promise);

    render(
      <SegmentedSelector
        ariaLabel="실패 선택"
        value="left"
        options={[
          { value: 'left', label: '왼쪽' },
          { value: 'right', label: '오른쪽' },
        ]}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole('radio', { name: '오른쪽' }));

    expect(screen.getByRole('radio', { name: '오른쪽' })).toHaveAttribute('aria-checked', 'true');

    deferred.reject(new Error('save failed'));

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: '왼쪽' })).toHaveAttribute('aria-checked', 'true');
    });
  });

  it('supports palette layout', async () => {
    function PaletteHarness() {
      const [value, setValue] = useState<'mist' | 'ocean-sand'>('mist');

      return (
        <>
          <SegmentedSelector
            ariaLabel="색상쌍 선택"
            value={value}
            layout="palette"
            columns={2}
            options={[
              { value: 'mist', label: 'Mist' },
              { value: 'ocean-sand', label: 'Ocean / Sand' },
            ]}
            onChange={async (nextValue) => {
              setValue(nextValue);
            }}
          />
          <span data-testid="palette-value">{value}</span>
        </>
      );
    }

    render(<PaletteHarness />);

    await userEvent.click(screen.getByRole('radio', { name: 'Ocean / Sand' }));

    expect(screen.getByTestId('palette-value')).toHaveTextContent('ocean-sand');
  });

  it('applies popover tone class without affecting selection', async () => {
    render(
      <SegmentedSelector
        ariaLabel="팝오버 선택"
        tone="popover"
        motionStyle="subtle"
        value="left"
        options={[
          { value: 'left', label: '왼쪽' },
          { value: 'right', label: '오른쪽' },
        ]}
        onChange={async () => {}}
      />,
    );

    const group = screen.getByRole('radiogroup', { name: '팝오버 선택' });
    expect(group.className).toContain('is-popover');
    expect(screen.getByRole('radio', { name: '왼쪽' })).toHaveAttribute('aria-checked', 'true');
  });
});
