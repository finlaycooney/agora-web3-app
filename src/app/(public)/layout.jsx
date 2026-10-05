import 'slick-carousel/slick/slick.css';
import 'slick-carousel/slick/slick-theme.css';
import HeaderWrapper from '@/components/common/HeaderWrapper';
import FooterVisibility from '@/components/common/FooterVisibility';
import { PublicProviders } from './providers';

export default function PublicLayout({ children }) {
  return (
    <>
      <div className="bg-noise" />
      <PublicProviders>
        <HeaderWrapper />
        <main>{children}</main>
        <FooterVisibility />
      </PublicProviders>
    </>
  );
}
