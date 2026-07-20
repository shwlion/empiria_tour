import Link from 'next/link';
import { MapPin, Ticket, ImageIcon } from 'lucide-react';
import { tzAbbreviation, DEFAULT_TZ } from '@/lib/datetime';

export interface EventCardProps {
    id: string;
    title: string;
    slug: string;
    coverImageUrl?: string;
    venueName?: string;
    city?: string;
    category?: string;
    eventType?: string;
    startAt?: string;
    /** Event's IANA timezone — the date box + time line render in this zone with its label. */
    timezone?: string;
    minPrice: number;
    currencySymbol: string;
    attendeesCount?: number;
    attendeeAvatars?: string[];
    organizerName?: string;
    organizerAvatarUrl?: string | null;
    /** Number of additional VISIBLE co-organizers (hosts) on this event. */
    coHostCount?: number;
    /** 'external' events are hosted off-platform — no tickets sold here. */
    entryType?: string;
}

export function EventCard({
    title,
    slug,
    coverImageUrl,
    venueName,
    city,
    category,
    eventType = 'In-Person',
    startAt,
    timezone,
    minPrice,
    currencySymbol,
    organizerName,
    organizerAvatarUrl,
    coHostCount = 0,
    entryType,
}: EventCardProps) {
    const eventDate = startAt ? new Date(startAt) : null;
    // Render in the EVENT's own timezone (fallback to platform default).
    const TZ = timezone || DEFAULT_TZ;
    const month = eventDate?.toLocaleDateString('en-US', { timeZone: TZ, month: 'short' }).toUpperCase();
    const day = eventDate?.toLocaleDateString('en-US', { timeZone: TZ, day: 'numeric' });
    const dayName = eventDate?.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' });
    const time = eventDate?.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
    const tzLabel = startAt ? tzAbbreviation(startAt, TZ) : '';

    const isExternal = entryType === 'external';
    const isFree = minPrice === 0;

    return (
        <Link href={`/events/${slug}`} className="group block h-full">
            <div className="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-bone transition-all duration-300 hover:-translate-y-1 hover:border-flame hover:shadow-[0_24px_40px_-24px_rgba(23,19,15,0.45)]">
                {/* Image Section */}
                <div className="relative aspect-video overflow-hidden bg-soot">
                    {coverImageUrl ? (
                        <img
                            src={coverImageUrl}
                            alt={title}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(120%_120%_at_20%_0%,#2b2118_0%,#17130f_100%)]">
                            <ImageIcon className="h-8 w-8 text-flame/70" />
                        </div>
                    )}

                    {/* Event Type Badge */}
                    <div className="absolute left-3 top-3">
                        <span className="z-10 rounded bg-ink/90 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-bone backdrop-blur-sm">
                            {eventType}
                        </span>
                    </div>

                    {/* Category Badge */}
                    {category && (
                        <div className="absolute bottom-3 left-3">
                            <span className="z-10 rounded bg-flame px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white">
                                {category}
                            </span>
                        </div>
                    )}
                </div>

                {/* Content Section */}
                <div className="flex flex-1 flex-col p-5">
                    {/* Date and Title Row */}
                    <div className="mb-4 mt-1 flex items-start gap-4">
                        {/* Date stamp */}
                        {eventDate ? (
                            <div className="min-w-[54px] flex-shrink-0 rounded border border-line px-3 py-2 text-center">
                                <span className="block font-mono text-[10px] font-bold uppercase tracking-widest text-flame">{month}</span>
                                <span className="mt-0.5 block font-display text-xl font-semibold leading-tight text-ink">{day}</span>
                            </div>
                        ) : (
                            <div className="flex min-w-[54px] flex-shrink-0 items-center justify-center rounded border border-line px-3 py-2 text-center">
                                <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-stone">TBD</span>
                            </div>
                        )}

                        {/* Title and Time */}
                        <div className="flex h-full min-w-0 flex-1 flex-col pt-0.5">
                            <h3 className="line-clamp-2 font-display text-[17px] font-semibold leading-tight tracking-tight text-ink transition-colors group-hover:text-flame">
                                {title}
                            </h3>
                            {eventDate && (
                                <p className="mt-1.5 font-mono text-[11px] uppercase tracking-wide text-flame">
                                    {dayName}, {time}{tzLabel ? ` ${tzLabel}` : ''}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Location */}
                    <div className="mb-4 mt-auto flex items-center gap-2 text-stone">
                        <MapPin className="h-[15px] w-[15px] flex-shrink-0" />
                        <span className="line-clamp-1 font-mono text-[11px] uppercase tracking-wide">{city}{venueName ? `, ${venueName}` : ''}</span>
                    </div>

                    {/* Tickets Info */}
                    <div className="mb-4 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-stone">
                            <Ticket className="h-[15px] w-[15px] flex-shrink-0" />
                            <span className="font-mono text-[11px] uppercase tracking-wide">{isExternal ? 'External' : isFree ? 'Free entry' : 'Tickets from'}</span>
                        </div>
                        <span className="font-display text-[15px] font-semibold text-ink">
                            {isExternal ? 'Off-platform' : isFree ? 'Free' : `${currencySymbol}${minPrice.toLocaleString()}`}
                        </span>
                    </div>

                    {/* Divider */}
                    <div className="mb-4 border-t border-line" />

                    {/* Footer */}
                    <div className="mt-auto flex items-center justify-between">
                        {/* Organizer Info */}
                        <div className="flex min-w-0 items-center gap-2">
                            {/* Avatar (platform avatar for platform events, else organizer's) — initials fallback */}
                            {organizerAvatarUrl ? (
                                <img
                                    src={organizerAvatarUrl}
                                    alt={organizerName || 'Empiria Tour'}
                                    className="h-7 w-7 flex-shrink-0 rounded-full object-cover ring-1 ring-black/5"
                                />
                            ) : (
                                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-flame">
                                    <span className="font-mono text-[10px] font-bold uppercase leading-none text-white">
                                        {(organizerName || 'E').split(' ').map((w: string) => w[0]).slice(0, 2).join('')}
                                    </span>
                                </div>
                            )}
                            <span className="line-clamp-1 font-mono text-[11px] uppercase tracking-wide text-stone">
                                {organizerName || 'Empiria Tour'}
                            </span>
                            {coHostCount > 0 && (
                                <span className="flex-shrink-0 font-mono text-[10px] uppercase text-stone">
                                    +{coHostCount}
                                </span>
                            )}
                        </div>

                        {/* View Details Link */}
                        <span className="flex-shrink-0 font-mono text-[11px] font-bold uppercase tracking-wide text-flame group-hover:underline">
                            {isExternal ? 'Visit →' : 'Tickets →'}
                        </span>
                    </div>
                </div>
            </div>
        </Link>
    );
}
