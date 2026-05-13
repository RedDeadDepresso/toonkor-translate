import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import BrowsePage from './pages/BrowsePage';
import LibraryPage from './pages/LibraryPage';
import ChapterPage from './pages/ChapterPage';
import ManhwaPage from './pages/ManhwaPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <LibraryPage />,
  },
  {
    path: '/manhwa/:toonkorId',
    element: <ManhwaPage />,
  },
  {
    path: '/chapter/:toonkorId/:choice',
    element: <ChapterPage />,
  },
  {
    path: '/library',
    element: <LibraryPage />,
  },
  {
    path: '/browse',
    element: <BrowsePage />,
  },
]);

export function Router() {
  return <RouterProvider router={router} />;
}
