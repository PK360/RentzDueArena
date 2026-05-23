import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import App, {
  isForumCardActionTarget,
  mergeForumEntryPreservingReplies,
  stopForumCardActionPropagation
} from './App';

describe('App training entry point', () => {
  test('renders the training call-to-action and opens Trainer Setup', async () => {
    const user = userEvent.setup();

    render(<App />);

    expect(await screen.findByText('Play as Guest')).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText('Enter a guest display name...'),
      'Frontend Tester'
    );
    await user.click(screen.getByRole('button', { name: 'Continue as Guest' }));

    expect((await screen.findAllByText('Play against the AI-powered training bot')).length).toBeGreaterThan(0);

    await user.click(await screen.findByRole('button', { name: 'Start Training' }));

    expect(await screen.findByText('Trainer Setup')).toBeInTheDocument();
    expect(await screen.findByText('Selection required')).toBeInTheDocument();
    expect(await screen.findByText('Send message before Trainer move')).toBeInTheDocument();
  });
});

describe('forum UI helpers', () => {
  test('preserves thread replies when a post action returns an entry without replies', () => {
    const currentEntry = {
      id: 'post-1',
      text: 'root',
      replies: [{ id: 'reply-1', text: 'keep me' }]
    };
    const nextEntry = {
      id: 'post-1',
      text: 'root updated',
      replies: []
    };

    expect(mergeForumEntryPreservingReplies(currentEntry, nextEntry)).toEqual({
      id: 'post-1',
      text: 'root updated',
      replies: [{ id: 'reply-1', text: 'keep me' }]
    });
  });

  test('stops forum action bubbling and detects action targets', () => {
    const stopPropagation = vi.fn();
    stopForumCardActionPropagation({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalledTimes(1);

    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<button data-forum-card-action="true"><span>Like</span></button>';
    const innerTarget = wrapper.querySelector('span');

    expect(isForumCardActionTarget(innerTarget)).toBe(true);
    expect(isForumCardActionTarget(wrapper)).toBe(false);
  });
});
