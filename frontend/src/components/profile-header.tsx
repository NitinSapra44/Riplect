import { useState } from "react";
import type { Profile } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { getFaviconUrl } from "@/lib/favicon";
import {
  ExternalLink,
  Home,
  Mail,
  Download,
  Calendar,
  BookOpen,
  Video,
  Music,
  ShoppingBag,
  Link as LinkIcon,
  Globe,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// Import custom social media icons
import instagramIcon from "@assets/001-Instagram-social_1763698794306.png";
import facebookIcon from "@assets/002-facebook_1763698698530.png";
import twitterIcon from "@assets/003-twitter_1763698698530.png";
import whatsappIcon from "@assets/004-message_1763698698530.png";
import youtubeIcon from "@assets/006-youtube_1763698698530.png";
import linkedinIcon from "@assets/007-linkedin_1763698698530.png";
import websiteIcon from "@assets/014-web_1763698698530.png";
import defaultProfileImage from "@assets/WhatsApp Image 2025-11-28 at 13.31.40_1764389051024.jpeg";

const extractYouTubeId = (url: string): string => {
  if (!url) return "";
  const regExp =
    /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[7].length === 11 ? match[7] : "";
};

const getIconComponent = (iconName: string) => {
  const iconProps = { className: "w-6 h-6 mr-2 text-[#b66667]" };
  const iconMap = {
    link: <LinkIcon {...iconProps} />,
    download: <Download {...iconProps} />,
    mail: <Mail {...iconProps} />,
    calendar: <Calendar {...iconProps} />,
    book: <BookOpen {...iconProps} />,
    video: <Video {...iconProps} />,
    music: <Music {...iconProps} />,
    shop: <ShoppingBag {...iconProps} />,
    website: <Globe {...iconProps} />,
    external: <ExternalLink {...iconProps} />,
  };
  return (
    iconMap[iconName as keyof typeof iconMap] || <LinkIcon {...iconProps} />
  );
};

interface ProfileHeaderProps {
  profile: Profile;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export function ProfileHeader({
  profile,
  activeTab = "home",
  onTabChange,
}: ProfileHeaderProps) {
  const [isLongBioExpanded, setIsLongBioExpanded] = useState(false);
  const socialLinks = profile.socialLinks || {};
  const customLinks = profile.customLinks || [];

  const socialMediaLinks = profile.contactInfo?.socialMediaLinks || [];
  const facebookLink = socialMediaLinks.find(
    (link) => link.platform === "facebook",
  )?.url;
  const twitterLink = socialMediaLinks.find(
    (link) => link.platform === "twitter",
  )?.url;
  const instagramFromContact = socialMediaLinks.find(
    (link) => link.platform === "instagram",
  )?.url;
  const linkedinFromContact = socialMediaLinks.find(
    (link) => link.platform === "linkedin",
  )?.url;
  const youtubeFromContact = socialMediaLinks.find(
    (link) => link.platform === "youtube",
  )?.url;

  const hasLongBio = profile.longBio && profile.longBio.trim().length > 0;

  return (
    <div className="shadow-sm">
      {/* Reduced padding to px-3 and removed top padding (pt-0) to sit higher */}
      <div className="max-w-4xl mx-auto px-3 sm:px-6 lg:px-8 pb-4">
        <div className="flex flex-col items-center text-center">

          {/* Profile Picture Card */}
          {/* Width slightly increased for mobile and larger screens to reduce gap to screen edges */}
          <div className="w-full max-w-[23rem] sm:max-w-[26rem] mx-auto mb-4 relative rounded-2xl overflow-hidden shadow-xl bg-muted group mt-4">
            <div className="aspect-[4/5] w-full relative">
              <img
                src={profile.profileImageUrl || defaultProfileImage}
                alt={`${profile.displayName}`}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                loading="eager"
                decoding="async"
                data-testid="img-profile-picture"
              />

              {/* Text Overlay with Mild Gradient */}
              {/* Changed from heavy blur to smooth gradient from black/80 to transparent */}
              <div className="absolute bottom-0 left-0 right-0 pt-24 pb-3 px-5 bg-gradient-to-t from-black via-black/30 to-transparent text-center">
                <h1
                  className="text-3xl font-bold text-white mb-0 shadow-sm leading-tight"
                  data-testid="text-display-name"
                >
                  {profile.displayName}
                </h1>

                {profile.title && (
                  <p
                    className="text-lg font-medium"
                    style={{ color: '#cd5c5c' }}
                    data-testid="text-professional-title"
                  >
                    {profile.title}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Short Bio Section */}
          {profile.shortBio && (
              <div className={`max-w-2xl w-full px-2 ${(profile.shortBioImageUrl || profile.shortBioYoutubeUrl) ? "mb-2" : "mb-0"}`}>
              <p
                className="text-gray-600 text-base md:text-lg mb-2 text-center leading-relaxed whitespace-pre-line"
                data-testid="text-short-bio"
              >
                {profile.shortBio}
              </p>

              {(profile.shortBioImageUrl || profile.shortBioYoutubeUrl) && (
                <div className="mb-1 rounded-lg overflow-hidden shadow-md">
                  {profile.shortBioYoutubeUrl ? (
                    <div
                      className="relative w-full"
                      style={{ paddingBottom: "56.25%" }}
                    >
                      <iframe
                        className="absolute top-0 left-0 w-full h-full"
                        src={`https://www.youtube.com/embed/${extractYouTubeId(profile.shortBioYoutubeUrl)}`}
                        title="Short Bio Video"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        data-testid="iframe-short-bio-video"
                      />
                    </div>
                  ) : profile.shortBioImageUrl ? (
                    <div className="bg-muted" style={{ minHeight: "200px" }}>
                      <img
                        src={profile.shortBioImageUrl}
                        alt="Short bio visual"
                        className="w-full h-auto object-cover"
                        style={{ maxHeight: "400px" }}
                        loading="eager"
                        decoding="async"
                        data-testid="img-short-bio"
                      />
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}

          {/* Long Bio Expandable Section */}
          {hasLongBio && (
      <div className={`max-w-2xl w-full px-2 ${(profile.longBioImageUrl || profile.longBioYoutubeUrl) ? "mb-2" : "mb-0"}`}>
              <div className="flex justify-center mb-1">
                <button
                  onClick={() => setIsLongBioExpanded(!isLongBioExpanded)}
                  className="flex items-center gap-1 px-4 py-1 rounded-full hover:bg-gray-100 text-gray-600 transition-colors text-sm"
                  aria-label={
                    isLongBioExpanded ? "Hide full bio" : "Show full bio"
                  }
                  data-testid="button-toggle-long-bio"
                >
                  <span className="font-medium">
                    {isLongBioExpanded ? "Read Less" : "Read More"}
                  </span>
                  {isLongBioExpanded ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
              </div>

              {isLongBioExpanded && (
                <div className="text-center">
                  <p
                    className="text-gray-600 text-base md:text-lg mb-4 whitespace-pre-wrap leading-relaxed"
                    data-testid="text-long-bio"
                  >
                    {profile.longBio}
                  </p>
                   {(profile.longBioImageUrl || profile.longBioYoutubeUrl) && (
                    <div className="rounded-lg overflow-hidden shadow-md">
                      {profile.longBioYoutubeUrl ? (
                        <div
                          className="relative w-full"
                          style={{ paddingBottom: "56.25%" }}
                        >
                          <iframe
                            className="absolute top-0 left-0 w-full h-full"
                            src={`https://www.youtube.com/embed/${extractYouTubeId(profile.longBioYoutubeUrl)}`}
                            title="Long Bio Video"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            data-testid="iframe-long-bio-video"
                          />
                        </div>
                      ) : profile.longBioImageUrl ? (
                        <div className="bg-muted" style={{ minHeight: "200px" }}>
                          <img
                            src={profile.longBioImageUrl}
                            alt="Long bio visual"
                            className="w-full h-auto object-cover"
                            style={{ maxHeight: "400px" }}
                            loading="lazy"
                            decoding="async"
                            data-testid="img-long-bio"
                          />
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Social Media Links */}
          <div className="flex justify-center gap-3 mb-2 flex-wrap">
            {(socialLinks.instagram || instagramFromContact) && (
              <a
                href={socialLinks.instagram || instagramFromContact}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-9 h-9 hover:opacity-80 transition-opacity"
                data-testid="link-instagram"
              >
                <img src={instagramIcon} alt="Instagram" className="w-9 h-9 object-contain" />
              </a>
            )}
            {facebookLink && (
              <a
                href={facebookLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-9 h-9 hover:opacity-80 transition-opacity"
                data-testid="link-facebook"
              >
                <img src={facebookIcon} alt="Facebook" className="w-9 h-9 object-contain" />
              </a>
            )}
            {(socialLinks.youtube || youtubeFromContact) && (
              <a
                href={socialLinks.youtube || youtubeFromContact}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-9 h-9 hover:opacity-80 transition-opacity"
                data-testid="link-youtube"
              >
                <img src={youtubeIcon} alt="YouTube" className="w-9 h-9 object-contain" />
              </a>
            )}
            {socialLinks.whatsapp && (
              <a
                href={`https://wa.me/${socialLinks.whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-9 h-9 hover:opacity-80 transition-opacity"
                data-testid="link-whatsapp"
              >
                <img src={whatsappIcon} alt="WhatsApp" className="w-9 h-9 object-contain" />
              </a>
            )}
            {(socialLinks.linkedin || linkedinFromContact) && (
              <a
                href={socialLinks.linkedin || linkedinFromContact}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-9 h-9 hover:opacity-80 transition-opacity"
                data-testid="link-linkedin"
              >
                <img src={linkedinIcon} alt="LinkedIn" className="w-9 h-9 object-contain" />
              </a>
            )}
            {twitterLink && (
              <a
                href={twitterLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-9 h-9 hover:opacity-80 transition-opacity"
                data-testid="link-twitter"
              >
                <img src={twitterIcon} alt="Twitter/X" className="w-9 h-9 object-contain" />
              </a>
            )}
            {socialLinks.website && (
              <a
                href={socialLinks.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-9 h-9 hover:opacity-80 transition-opacity"
                data-testid="link-website"
              >
                <img src={websiteIcon} alt="Website" className="w-9 h-9 object-contain" />
              </a>
            )}
          </div>

          {/* Custom External Links */}
          {customLinks.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-3 justify-center w-full max-w-[350px]">
              {customLinks.map((link, index) => {
                const faviconUrl = link.url ? getFaviconUrl(link.url, 32) : null;
                return (
                  <div
                    key={index}
                    className="w-full rounded-full bg-gradient-to-r from-[#b66667] to-[#ffffff] p-[1px]"
                  >
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-start px-6 py-1.5 bg-white text-gray-500 rounded-full hover:bg-gray-50 transition-colors"
                      data-testid={`link-custom-${index}`}
                    >
                      <span className="relative w-6 h-6 mr-2 flex-shrink-0">
                        {faviconUrl && (
                          <img 
                            src={faviconUrl} 
                            alt="" 
                            className="absolute inset-0 w-6 h-6 object-contain"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fallback = e.currentTarget.nextElementSibling;
                              if (fallback) (fallback as HTMLElement).style.display = 'block';
                            }}
                          />
                        )}
                        <span className={faviconUrl ? "hidden" : "block"}>
                          {getIconComponent(link.icon || "link")}
                        </span>
                      </span>
                      <span className="font-normal">{link.title}</span>
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="border-t border-gray-200 mt-3">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-center space-x-8">
              <button
                onClick={() => onTabChange?.("home")}
                className={`py-3 px-6 border-b-2 font-medium text-sm transition-colors flex items-center ${
                  activeTab === "home"
                    ? "border-primary text-primary"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
                data-testid="tab-home"
              >
                <Home className="w-4 h-4 mr-2" />
                Home
              </button>
              <button
                onClick={() => onTabChange?.("contact")}
                className={`py-3 px-6 border-b-2 font-medium text-sm transition-colors flex items-center ${
                  activeTab === "contact"
                    ? "border-primary text-primary"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
                data-testid="tab-contact"
              >
                <Mail className="w-4 h-4 mr-2" />
                Contact
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}