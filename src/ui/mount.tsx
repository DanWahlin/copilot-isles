import { createRoot } from 'react-dom/client';
import { TitleMenu } from './TitleMenu';

export function mountUi(el: HTMLElement): void {
  createRoot(el).render(<TitleMenu />);
}
