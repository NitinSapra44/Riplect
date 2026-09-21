import { useEffect, type ReactNode } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ScrollText } from "lucide-react";
import riplekLogo1 from "@assets/Color_Variations_copy_9@144x-2_1775978761578.png";

const SECTIONS: Array<{
  title: string;
  intro?: string;
  paragraphs?: string[];
  paragraphNodes?: ReactNode[];
  bullets?: string[];
  outro?: string[];
}> = [
  {
    title: "1. Nature of the Platform",
    paragraphs: [
      "Riplect is a discovery and facilitation platform that connects users with coaches, guides, healers, and conscious creators offering services, events, digital products, and experiences.",
      "While the platform may provide tools to support interaction — such as listing pages, external payment links, and confirmation features — all payments are processed outside of Riplect through third-party payment providers chosen by the coach.",
      "Riplect does not process, collect, or hold any payments.",
    ],
  },
  {
    title: "2. No Responsibility for Transactions",
    paragraphs: [
      "Riplect is not a party to any transaction between users and coaches.",
      "Any payment made by a user is conducted directly with the coach via external payment systems.",
    ],
    intro: "Riplect is not responsible for:",
    bullets: [
      "Payment processing or verification",
      "Delivery or non-delivery of services or products",
      "Accuracy of payment confirmations or proof submissions",
      "Refunds, cancellations, or disputes",
    ],
    outro: [
      "Riplect does not verify payments or enforce delivery obligations between users and coaches.",
      "Any confirmation or communication tools provided on the platform are for informational purposes only and do not constitute verification or guarantee of any transaction.",
      "Users engage with coaches at their own discretion and risk.",
    ],
  },
  {
    title: "3. Eligibility",
    intro: "By using Riplect, you confirm that:",
    bullets: [
      "You are at least 18 years old",
      "You have the legal capacity to enter into agreements",
    ],
    outro: [
      "Only individuals aligned with wellness, conscious creativity, and human development may create profiles on the platform.",
      "We reserve the right to remove any profile that does not align with the purpose of the platform.",
    ],
  },
  {
    title: "4. Accounts",
    paragraphs: [
      "Users and creators are responsible for maintaining the accuracy of their account information.",
      "You may delete your account at any time.",
    ],
    intro: "Riplect reserves the right to suspend or terminate any account, without notice, if:",
    bullets: [
      "These Terms are violated",
      "Harmful, misleading, or inappropriate conduct is identified",
      "Content or services are deemed unsafe or misaligned with platform values",
    ],
  },
  {
    title: "5. Content & Conduct",
    intro: "The following are strictly prohibited on Riplect:",
    bullets: [
      "False or misleading claims",
      "Sexual content or services",
      "Drug-related or illegal practices",
      "Harmful, unsafe, or exploitative practices",
      "Any content that may negatively impact users' well-being",
    ],
    outro: [
      "Riplect reserves the right to remove any content or account that violates these rules.",
    ],
  },
  {
    title: "6. Role of Coaches & Creators",
    intro: "All coaches and creators are independently responsible for:",
    bullets: [
      "The accuracy of their content",
      "The services they provide",
      "Communication with their clients",
      "Delivery of sessions, events, or products",
    ],
    outro: [
      "Riplect does not verify credentials and does not guarantee the quality, safety, or effectiveness of any offering.",
    ],
  },
  {
    title: "7. Disclaimer of Liability",
    paragraphs: ["Riplect is a platform for connection only."],
    intro: "We are not responsible for:",
    bullets: [
      "Outcomes of any sessions, services, or experiences",
      "Any emotional, physical, or psychological impact",
      "Interactions between users and coaches",
    ],
    outro: ["All use of the platform is at your own risk."],
  },
  {
    title: "8. Wellness & Medical Disclaimer",
    paragraphs: [
      "Content and services on Riplect are intended for wellness, personal development, and educational purposes only.",
      "They are not a substitute for professional medical, psychological, legal, or financial advice.",
      "Users should seek appropriate licensed professionals when needed.",
    ],
  },
  {
    title: "9. Subscriptions",
    paragraphs: [
      "Riplect offers a subscription model for certain features available to coaches.",
    ],
    bullets: [
      "Subscriptions are planned to begin in October 2026",
      "Some features of the platform will remain free",
      "Subscription terms and pricing may be updated over time",
    ],
  },
  {
    title: "10. Intellectual Property",
    paragraphs: [
      "All content on the platform, including text, design, and branding, is the property of Riplect or its users.",
      "You may not copy, distribute, or use platform content without permission.",
    ],
  },
  {
    title: "11. Platform Availability",
    intro: "We aim to provide a reliable platform but do not guarantee:",
    bullets: [
      "Continuous availability",
      "Error-free operation",
      "Uninterrupted access",
    ],
  },
  {
    title: "12. Modifications",
    paragraphs: [
      "Riplect reserves the right to update or modify these Terms at any time.",
      "Continued use of the platform after changes implies acceptance of the updated Terms.",
    ],
  },
  {
    title: "13. Governing Law",
    paragraphs: [
      "Riplect is currently not tied to a specific legal jurisdiction.",
      "These Terms are intended to comply with general applicable laws and principles.",
    ],
  },
  {
    title: "14. Contact",
    paragraphNodes: [
      <>
        For any questions regarding these Terms, please contact:{" "}
        <a
          href="mailto:riplek2025@gmail.com"
          className="text-[#b66667] underline underline-offset-2 hover:text-[#9e5556]"
          data-testid="link-terms-contact-email"
        >
          riplek2025@gmail.com
        </a>
      </>,
    ],
  },
];

export default function TermsOfService() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Terms of Service | Riplect";

    const metaSelector = 'meta[name="description"]';
    let meta = document.head.querySelector<HTMLMetaElement>(metaSelector);
    const previousDescription = meta?.getAttribute("content") ?? null;
    const created = !meta;
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute(
      "content",
      "The Terms of Service that govern your use of Riplect, the conscious creativity and wellness platform connecting people with coaches, guides, and healers.",
    );

    return () => {
      document.title = previousTitle;
      if (created && meta?.parentNode) {
        meta.parentNode.removeChild(meta);
      } else if (meta && previousDescription !== null) {
        meta.setAttribute("content", previousDescription);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-white font-sans">
      <nav className="absolute top-0 w-full z-50 pt-4 pb-2">
        <div className="max-w-7xl mx-auto pl-0 pr-4 sm:pl-0 sm:pr-6 lg:pl-0 lg:pr-8">
          <div className="flex flex-wrap justify-between items-center h-16 gap-4">
            <div className="flex items-center">
              <Link href="/">
                <img
                  src={riplekLogo1}
                  alt="Riplect"
                  className="h-11 cursor-pointer ml-2"
                  data-testid="img-header-logo"
                />
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button
                  variant="ghost"
                  className="rounded-full bg-white text-[#C96868]/90 text-sm font-medium hover:bg-[#C96868]/90 hover:text-white transition-colors border border-[#b66667]"
                  data-testid="button-back-home"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Home
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <section className="pt-32 pb-10 bg-gradient-to-b from-[#FDF6EE]/50 to-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#b66667]/5 rounded-full blur-[100px] translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#b66667]/3 rounded-full blur-[80px] -translate-x-1/2 translate-y-1/2 pointer-events-none" />

        <div className="max-w-3xl mx-auto px-4 text-center relative z-10">
          <div className="w-14 h-14 rounded-full bg-[#FDF6EE] flex items-center justify-center mx-auto mb-6">
            <ScrollText className="w-6 h-6 text-[#b66667]" />
          </div>
          <h1
            className="text-3xl md:text-4xl lg:text-5xl font-bold text-stone-600 tracking-tight"
            data-testid="text-terms-title"
          >
            Terms of Service
          </h1>
          <p
            className="mt-4 text-sm md:text-base text-gray-500"
            data-testid="text-terms-effective-date"
          >
            Effective Date: 25 April 2026
          </p>
        </div>
      </section>

      <section className="pb-16 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="space-y-6 mb-12">
            <p
              className="text-gray-600 text-base md:text-lg leading-relaxed"
              data-testid="text-terms-welcome"
            >
              Welcome to Riplect. These Terms of Service (“Terms”) govern your
              access to and use of the Riplect platform (“Platform”, “we”,
              “us”, “our”).
            </p>
            <p
              className="text-gray-600 text-base md:text-lg leading-relaxed"
              data-testid="text-terms-agree"
            >
              By accessing or using Riplect, you agree to be bound by these
              Terms.
            </p>
          </div>

          <div className="space-y-10">
            {SECTIONS.map((section, idx) => (
              <article
                key={section.title}
                data-testid={`section-terms-${idx + 1}`}
              >
                <h2 className="text-xl md:text-2xl font-semibold text-stone-700 mb-4">
                  {section.title}
                </h2>

                {section.paragraphs?.map((p, i) => (
                  <p
                    key={`p-${i}`}
                    className="text-gray-600 leading-relaxed mb-3 last:mb-0"
                  >
                    {p}
                  </p>
                ))}

                {section.paragraphNodes?.map((p, i) => (
                  <p
                    key={`pn-${i}`}
                    className="text-gray-600 leading-relaxed mb-3 last:mb-0"
                  >
                    {p}
                  </p>
                ))}

                {section.intro && (
                  <p className="text-gray-600 leading-relaxed mt-3 mb-2">
                    {section.intro}
                  </p>
                )}

                {section.bullets && (
                  <ul className="list-disc pl-5 space-y-1.5 text-gray-600 leading-relaxed marker:text-[#b66667]">
                    {section.bullets.map((b, i) => (
                      <li key={`b-${i}`}>{b}</li>
                    ))}
                  </ul>
                )}

                {section.outro?.map((p, i) => (
                  <p
                    key={`o-${i}`}
                    className="text-gray-600 leading-relaxed mt-3"
                  >
                    {p}
                  </p>
                ))}
              </article>
            ))}
          </div>

          <div className="mt-12 pt-8 border-t border-gray-100">
            <p
              className="text-gray-500 text-sm md:text-base italic leading-relaxed"
              data-testid="text-terms-acknowledgement"
            >
              By using Riplect, you acknowledge that you have read, understood,
              and agreed to these Terms.
            </p>
          </div>

          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/privacy-policy">
              <Button
                variant="outline"
                className="rounded-full border-[#b66667] text-[#b66667] hover:bg-[#FDF6EE]"
                data-testid="button-view-privacy"
              >
                View Privacy Policy
              </Button>
            </Link>
            <Link href="/contact">
              <Button
                variant="ghost"
                className="rounded-full text-stone-600 hover:bg-[#FDF6EE]"
                data-testid="button-contact-from-terms"
              >
                Contact Us
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="py-12 border-t border-gray-100 bg-[#FDF6EE]/30">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row flex-wrap justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <img
                src={riplekLogo1}
                alt="Riplect"
                className="h-8"
                data-testid="img-footer-logo"
              />
              <span
                className="text-sm text-gray-400"
                data-testid="text-copyright"
              >
                © 2025
              </span>
            </div>
            <div className="flex flex-wrap gap-8 text-sm text-gray-500">
              <Link
                href="/about"
                className="hover:text-gray-900 transition-colors"
                data-testid="link-footer-about"
              >
                About
              </Link>
              <Link
                href="/terms-of-service"
                className="hover:text-gray-900 transition-colors"
                data-testid="link-footer-terms"
              >
                Terms
              </Link>
              <Link
                href="/privacy-policy"
                className="hover:text-gray-900 transition-colors"
                data-testid="link-footer-privacy"
              >
                Privacy
              </Link>
              <Link
                href="/contact"
                className="hover:text-gray-900 transition-colors"
                data-testid="link-footer-contact"
              >
                Contact
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
