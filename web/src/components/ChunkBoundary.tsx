'use client';
import { Component, type ReactNode } from 'react';

/**
 * Keeps a part of the page that loads on its own (the arrival's stage, Explore's 3D tab) from blanking the whole
 * page when its code fails to load or to run: after a redeploy while a tab is open, or on a dropped connection, the
 * part shows its fallback and the rest of the page stays, where the error page would replace all of it.
 */
export class ChunkBoundary extends Component<{ fallback: ReactNode; onError?: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError?.();
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
