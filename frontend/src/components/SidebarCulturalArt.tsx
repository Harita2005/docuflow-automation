interface SidebarCulturalArtProps {
  className?: string;
}

export default function SidebarCulturalArt({ className = "" }: SidebarCulturalArtProps) {
  return (
    <div className={`w-full h-full pointer-events-none select-none ${className}`}>
      <svg
        className="w-full h-full"
        viewBox="0 0 340 380"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g stroke="#7C9B55" strokeOpacity="0.28" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          {/* Cloud Outline Left */}
          <path d="M20 280 Q35 265 55 270 Q70 250 95 260 Q110 255 125 270 L20 270 Z" fill="none" strokeWidth="0.9" opacity="0.6" />
          {/* Cloud Outline Right */}
          <path d="M220 260 Q240 245 265 250 Q280 235 305 245 Q320 240 330 255 L220 255 Z" fill="none" strokeWidth="0.9" opacity="0.6" />

          {/* Temple Gopuram Tower Base to Top Tiers */}

          {/* Kalasam Finials at Very Top */}
          <path d="M150 70 L150 55 M150 55 C147 50 153 50 150 45 C148 42 152 42 150 38" />
          <path d="M170 65 L170 50 M170 50 C167 45 173 45 170 40 C168 37 172 37 170 33" strokeWidth="1.4" />
          <path d="M190 70 L190 55 M190 55 C187 50 193 50 190 45 C188 42 192 42 190 38" />

          {/* Top Arch Crown */}
          <path d="M135 72 Q170 52 205 72 L198 82 Q170 66 142 82 Z" fill="none" strokeWidth="1.2" />

          {/* Tier 1 (Top Level) */}
          <path d="M140 82 L200 82 L204 105 L136 105 Z" fill="none" />
          <line x1="155" y1="82" x2="155" y2="105" />
          <line x1="170" y1="82" x2="170" y2="105" strokeWidth="1.4" />
          <line x1="185" y1="82" x2="185" y2="105" />
          {/* Decorative pillars Tier 1 */}
          <path d="M165 92 Q170 86 175 92 L175 105 L165 105 Z" fill="none" strokeWidth="0.9" />

          {/* Tier 2 */}
          <path d="M132 105 L208 105 L214 135 L126 135 Z" fill="none" strokeWidth="1.3" />
          <line x1="145" y1="105" x2="145" y2="135" />
          <line x1="160" y1="105" x2="160" y2="135" />
          <line x1="170" y1="105" x2="170" y2="135" strokeWidth="1.5" />
          <line x1="180" y1="105" x2="180" y2="135" />
          <line x1="195" y1="105" x2="195" y2="135" />
          {/* Miniature Kudus/Arches Tier 2 */}
          <path d="M148 118 Q154 112 160 118" />
          <path d="M180 118 Q186 112 192 118" />

          {/* Tier 3 */}
          <path d="M122 135 L218 135 L224 172 L116 172 Z" fill="none" strokeWidth="1.3" />
          <line x1="135" y1="135" x2="135" y2="172" />
          <line x1="150" y1="135" x2="150" y2="172" />
          <line x1="170" y1="135" x2="170" y2="172" strokeWidth="1.6" />
          <line x1="190" y1="135" x2="190" y2="172" />
          <line x1="205" y1="135" x2="205" y2="172" />
          {/* Arch details Tier 3 */}
          <path d="M160 152 Q170 142 180 152 M160 152 L160 172 M180 152 L180 172" />

          {/* Tier 4 */}
          <path d="M112 172 L228 172 L236 215 L104 215 Z" fill="none" strokeWidth="1.4" />
          <line x1="125" y1="172" x2="125" y2="215" />
          <line x1="142" y1="172" x2="142" y2="215" />
          <line x1="170" y1="172" x2="170" y2="215" strokeWidth="1.6" />
          <line x1="198" y1="172" x2="198" y2="215" />
          <line x1="215" y1="172" x2="215" y2="215" />
          {/* Tier 4 central sculpture niche */}
          <path d="M155 190 Q170 178 185 190 L185 215 L155 215 Z" />

          {/* Tier 5 (Base Level / Gopura Vasal Entrance) */}
          <path d="M100 215 L240 215 L248 268 L92 268 Z" fill="none" strokeWidth="1.5" />
          <line x1="115" y1="215" x2="115" y2="268" />
          <line x1="135" y1="215" x2="135" y2="268" />
          <line x1="205" y1="215" x2="205" y2="268" />
          <line x1="225" y1="215" x2="225" y2="268" />

          {/* Main Entrance Arch (Gopura Vasal) */}
          <path d="M148 268 L148 238 Q170 220 192 238 L192 268" strokeWidth="1.8" fill="none" />
          <path d="M154 268 L154 243 Q170 228 186 243 L186 268" strokeWidth="1.0" fill="none" />

          {/* Plinth Base Lines */}
          <line x1="80" y1="268" x2="260" y2="268" strokeWidth="1.6" />
          <line x1="70" y1="276" x2="270" y2="276" strokeWidth="1.2" />

          {/* Subtle Side Architecture Lines */}
          <path d="M40 276 L70 276 L70 240 L40 250 Z" opacity="0.5" />
          <path d="M270 276 L300 276 L300 250 L270 240 Z" opacity="0.5" />
        </g>
      </svg>
    </div>
  );
}
