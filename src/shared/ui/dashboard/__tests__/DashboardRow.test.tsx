import { render, screen } from '@testing-library/react';

import {
  DashboardRow,
  DashboardRowInlineError,
  DashboardRowValue,
  DashboardRowValueWrap,
} from '../DashboardRow';

describe('DashboardRow', () => {
  it('renders label and control content', () => {
    render(
      <DashboardRow label="Language">
        <input aria-label="Language input" />
      </DashboardRow>
    );

    expect(screen.getByText('Language')).toBeTruthy();
    expect(screen.getByLabelText('Language input')).toBeTruthy();
  });

  it('renders label element when labelFor is provided', () => {
    render(
      <DashboardRow label="Band Name" labelFor="band-name">
        <input id="band-name" />
      </DashboardRow>
    );

    expect(screen.getByLabelText('Band Name')).toBeTruthy();
  });

  it('applies action variant modifier', () => {
    const { container } = render(
      <DashboardRow label="Email" variant="action" action={<button type="button">Change</button>}>
        <span>user@example.com</span>
      </DashboardRow>
    );

    expect(container.querySelector('.dashboard-row--action')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Change' })).toBeTruthy();
  });

  it('applies start variant modifier', () => {
    const { container } = render(
      <DashboardRow label="About" variant="start">
        <textarea aria-label="About" />
      </DashboardRow>
    );

    expect(container.querySelector('.dashboard-row--start')).toBeTruthy();
  });
});

describe('DashboardRowValue', () => {
  it('renders value text', () => {
    const { container } = render(<DashboardRowValue>user@example.com</DashboardRowValue>);

    expect(screen.getByText('user@example.com')).toBeTruthy();
    expect(container.querySelector('.dashboard-row__value')).toBeTruthy();
  });
});

describe('DashboardRowValueWrap', () => {
  it('renders wrapped content', () => {
    const { container } = render(
      <DashboardRowValueWrap>
        <span>Email</span>
      </DashboardRowValueWrap>
    );

    expect(container.querySelector('.dashboard-row__value-wrap')).toBeTruthy();
  });
});

describe('DashboardRowInlineError', () => {
  it('renders error with alert role', () => {
    render(<DashboardRowInlineError>Something went wrong</DashboardRowInlineError>);

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });
});
