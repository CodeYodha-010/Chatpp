import { motion, useScroll, useSpring } from 'motion/react';
import './landing.css';
import Navbar from './Navbar';
import Hero from './Hero';
import TrustBar from './TrustBar';
import FeatureGrid from './FeatureGrid';
import Security from './Security';
import Architecture from './Architecture';
import Testimonials from './Testimonials';
import CTA from './CTA';
import Footer from './Footer';

function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 24, restDelta: 0.001 });
  return <motion.div className="lp-scroll-progress" style={{ scaleX }} />;
}

function LandingPage({ onGetStarted }) {
  return (
    <div className="lp-page" id="top">
      <ScrollProgress />
      <Navbar onGetStarted={onGetStarted} />
      <main>
        <Hero onGetStarted={onGetStarted} />
        <TrustBar />
        <FeatureGrid />
        <Security />
        <Architecture />
        <Testimonials />
        <CTA onGetStarted={onGetStarted} />
      </main>
      <Footer />
    </div>
  );
}

export default LandingPage;