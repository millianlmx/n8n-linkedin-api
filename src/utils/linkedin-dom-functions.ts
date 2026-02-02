/**
 * LinkedIn DOM Extraction Functions
 * 
 * These functions are designed to run in the browser context via page.evaluate()
 * They are extracted here to make them unit-testable with jsdom
 */

// ============================================================================
// PROFILE SCRAPING FUNCTIONS
// ============================================================================

export function extractProfileData() {
  // Helper function to find sections by their anchor ID
  const getSectionByAnchor = (anchorId: string) => {
    const anchor = document.querySelector(`div#${anchorId}`);
    return anchor?.closest('section') || null;
  };

  const getName = () => {
    console.log('[DOM] Extracting name...');
    // Try multiple selectors for the name (LinkedIn uses obfuscated class names)
    let nameEl = document.querySelector('h1.text-heading-xlarge');
    if (nameEl) console.log('[DOM] Found name with .text-heading-xlarge');

    if (!nameEl) {
      nameEl = document.querySelector('h1.inline.t-24.v-align-middle.break-words');
      if (nameEl) console.log('[DOM] Found name with .t-24.v-align-middle');
    }
    if (!nameEl) {
      // Fallback: any h1 with v-align-middle class
      nameEl = document.querySelector('h1.v-align-middle.break-words');
      if (nameEl) console.log('[DOM] Found name with .v-align-middle');
    }
    if (!nameEl) {
      // Last resort: look for h1 inside the profile card
      nameEl = document.querySelector('.pv-top-card h1');
      if (nameEl) console.log('[DOM] Found name with .pv-top-card h1');
    }

    if (!nameEl) {
      console.log('[DOM] Name element NOT found!');
      // Dump some HTML to help debug
      const topCard = document.querySelector('.pv-top-card');
      if (topCard) {
        console.log('[DOM] Top card HTML:', topCard.innerHTML.substring(0, 500));
      } else {
        console.log('[DOM] Top card .pv-top-card NOT found either');
        console.log('[DOM] Body classes:', document.body.className);
        console.log('[DOM] Main content HTML:', document.querySelector('main')?.innerHTML.substring(0, 200));
      }
    }

    return nameEl?.textContent?.trim() || '';
  };

  const getTitle = () => {
    // Try multiple selectors for title/headline
    let titleEl = document.querySelector('div.text-body-medium.break-words');
    if (!titleEl) {
      titleEl = document.querySelector('div.text-body-medium[data-generated-suggestion-target]');
    }
    if (!titleEl) {
      // Fallback: look within the profile header
      titleEl = document.querySelector('.pv-top-card .text-body-medium');
    }
    return titleEl?.textContent?.trim() || '';
  };

  const getLocation = () => {
    // Try to find location in the top card section
    let locationEl = document.querySelector('span.text-body-small.inline.t-black--light.break-words');
    if (!locationEl) {
      // Alternative: look for location near the name/title
      const topCard = document.querySelector('.pv-top-card') || document.querySelector('section[data-member-id]');
      if (topCard) {
        const locationSpans = Array.from(topCard.querySelectorAll('span.text-body-small'));
        for (const span of locationSpans) {
          const text = span.textContent?.trim() || '';
          // Location typically contains country names or city names
          if (text && !text.includes('relation') && !text.includes('abonné') && !text.includes('follower')) {
            locationEl = span;
            break;
          }
        }
      }
    }
    return locationEl?.textContent?.trim() || '';
  };

  const getConnectionCount = () => {
    // Try to find connection count
    let countEl = document.querySelector('li.text-body-small span.t-bold');
    if (!countEl) {
      countEl = document.querySelector('li.text-body-small a[href*="connectionOf"]');
    }
    if (!countEl) {
      // Look for "X relations" text
      const textElements = Array.from(document.querySelectorAll('span.text-body-small'));
      for (const el of textElements) {
        const text = el.textContent?.trim() || '';
        if (text.includes('relation') || text.includes('connection')) {
          return text;
        }
      }
    }
    return countEl?.textContent?.trim().replace(/\s+/g, ' ') || '';
  };

  const getProfileImage = () => {
    // Try multiple selectors for profile image
    let imgEl = document.querySelector('img.pv-top-card-profile-picture__image--show') as HTMLImageElement;
    if (!imgEl) {
      imgEl = document.querySelector('img[alt*="profil"]') as HTMLImageElement;
    }
    if (!imgEl) {
      imgEl = document.querySelector('button.pv-top-card-profile-picture__container img') as HTMLImageElement;
    }
    if (!imgEl) {
      // Look for any image in the profile picture area
      const profilePicContainer = document.querySelector('.pv-top-card__photo') ||
        document.querySelector('[class*="pv-top-card"]');
      if (profilePicContainer) {
        imgEl = profilePicContainer.querySelector('img') as HTMLImageElement;
      }
    }
    return imgEl?.src || '';
  };

  const getBackgroundImage = () => {
    let bgEl = document.querySelector('#profile-background-image-target-image') as HTMLImageElement;
    if (!bgEl) {
      bgEl = document.querySelector('.profile-background-image__image') as HTMLImageElement;
    }
    return bgEl?.src || '';
  };

  const getAbout = () => {
    const aboutSection = getSectionByAnchor('about');
    if (!aboutSection) return '';

    // Try multiple selectors for about text
    let aboutText = aboutSection.querySelector('div[class*=\'inline-show-more-text\'] > span[aria-hidden=\'true\']');
    if (!aboutText) {
      aboutText = aboutSection.querySelector('.pv-shared-text-with-see-more span[aria-hidden="true"]');
    }
    if (!aboutText) {
      // Fallback: get any text content from the section
      const spans = Array.from(aboutSection.querySelectorAll('span'));
      for (const span of spans) {
        const text = span.textContent?.trim() || '';
        if (text.length > 50) { // Assume about text is longer than 50 chars
          aboutText = span;
          break;
        }
      }
    }
    return aboutText?.textContent?.trim() || '';
  };

  const getEducation = () => {
    const education: any[] = [];
    const educationSection = getSectionByAnchor('education');
    if (!educationSection) return education;

    const eduItems = educationSection.querySelectorAll('ul > li.artdeco-list__item');

    eduItems.forEach((item) => {
      // Try to find school name - multiple fallback strategies
      let schoolEl = item.querySelector('div.display-flex.align-items-center.mr1.hoverable-link-text.t-bold > span[aria-hidden="true"]');
      if (!schoolEl) {
        schoolEl = item.querySelector('.hoverable-link-text.t-bold span[aria-hidden="true"]');
      }
      if (!schoolEl) {
        schoolEl = item.querySelector('span.t-bold span[aria-hidden="true"]');
      }

      const school = schoolEl?.textContent?.trim() || '';
      if (!school) return;

      // Find degree/field
      let degreeEl = item.querySelector('span.t-14.t-normal > span[aria-hidden="true"]');
      if (!degreeEl) {
        degreeEl = item.querySelector('span.t-normal span[aria-hidden="true"]');
      }
      const degreeAndField = degreeEl?.textContent?.trim() || '';

      // Find dates
      let datesEl = item.querySelector('span.t-14.t-normal.t-black--light > span[aria-hidden="true"]');
      if (!datesEl) {
        datesEl = item.querySelector('span.t-black--light span[aria-hidden="true"]');
      }
      const dates = datesEl?.textContent?.trim() || '';

      education.push({
        school,
        degree: degreeAndField,
        dates
      });
    });

    return education;
  };

  const getExperience = () => {
    const experience: any[] = [];
    const experienceSection = getSectionByAnchor('experience');
    if (!experienceSection) return experience;

    const expItems = experienceSection.querySelectorAll('ul > li.artdeco-list__item');

    expItems.forEach((item) => {
      // Try to find job title - multiple fallback strategies
      let titleEl = item.querySelector('div.display-flex.align-items-center.mr1.t-bold > span[aria-hidden="true"]');
      if (!titleEl) {
        titleEl = item.querySelector('.t-bold span[aria-hidden="true"]');
      }
      if (!titleEl) {
        titleEl = item.querySelector('div.hoverable-link-text span[aria-hidden="true"]');
      }

      const title = titleEl?.textContent?.trim() || '';
      if (!title) return;

      // Find company - look for spans with t-normal class
      const normalSpans = item.querySelectorAll('span.t-14.t-normal > span[aria-hidden="true"]');
      const company = normalSpans.length > 0 ? normalSpans[0]?.textContent?.trim() || '' : '';

      // Find dates - look for spans with t-black--light class
      const lightSpans = item.querySelectorAll('span.t-14.t-normal.t-black--light > span[aria-hidden="true"]');
      const dates = lightSpans.length > 0 ? lightSpans[0]?.textContent?.trim() || '' : '';

      // Location is typically the second light span
      const location = lightSpans.length > 1 ? lightSpans[1]?.textContent?.trim() || '' : '';

      experience.push({
        title,
        company,
        dates,
        location
      });
    });

    return experience;
  };

  const getSkills = () => {
    const skills: string[] = [];
    const skillsSection = getSectionByAnchor('skills');
    if (!skillsSection) return skills;

    // Try to find skill items
    let skillItems = skillsSection.querySelectorAll('div.display-flex.align-items-center.mr1.hoverable-link-text.t-bold > span[aria-hidden="true"]');
    if (skillItems.length === 0) {
      skillItems = skillsSection.querySelectorAll('.hoverable-link-text span[aria-hidden="true"]');
    }

    skillItems.forEach((item) => {
      const skill = item.textContent?.trim();
      if (skill && skill.length < 100) { // Avoid long descriptions
        skills.push(skill);
      }
    });

    return skills;
  };

  // Return all extracted data
  const data = {
    name: getName(),
    title: getTitle(),
    location: getLocation(),
    connections: getConnectionCount(),
    profileImage: getProfileImage(),
    backgroundImage: getBackgroundImage(),
    about: getAbout(),
    education: getEducation(),
    experience: getExperience(),
    skills: getSkills()
  };

  console.log('[DOM] Extracted data:', JSON.stringify(data));
  return data;
}

// ============================================================================
// CONVERSATION FUNCTIONS
// ============================================================================

export function extractConversationsList() {
  const convItems = document.querySelectorAll('li.msg-conversation-listitem');
  const results: any[] = [];

  convItems.forEach((item: Element, index: number) => {
    const nameEl = item.querySelector('.msg-conversation-card__participant-names .truncate');
    const name = nameEl?.textContent?.trim() || '';

    const snippetEl = item.querySelector('.msg-conversation-card__message-snippet');
    const lastMessageText = snippetEl?.textContent?.trim() || '';

    // Detect who sent the last message
    const sentByYou = lastMessageText.startsWith('Vous :') ||
      lastMessageText.startsWith('Vous\u00A0:') ||
      lastMessageText.includes('Vous&nbsp;:');

    const timeEl = item.querySelector('time.msg-conversation-card__time-stamp');
    const timestamp = timeEl?.textContent?.trim() || '';

    const unreadBadge = item.querySelector('.msg-conversation-card__unread-count');
    const isUnread = !!unreadBadge;

    if (nameEl) {
      results.push({
        index,
        name,
        lastMessage: lastMessageText,
        lastMessageSentByYou: sentByYou,
        timestamp,
        url: '', // Will be filled by clicking
        isUnread
      });
    }
  });

  return results;
}

export function extractUnreadConversations() {
  const convItems = document.querySelectorAll('li.msg-conversation-listitem');
  const unread: any[] = [];

  convItems.forEach((item: Element, index: number) => {
    const unreadBadge = item.querySelector('.msg-conversation-card__unread-count');
    if (!unreadBadge) return;

    const nameEl = item.querySelector('.msg-conversation-card__participant-names .truncate');
    const name = nameEl?.textContent?.trim() || '';

    const lastMessageEl = item.querySelector('.msg-conversation-card__message-snippet-body');
    const lastMessage = lastMessageEl?.textContent?.trim() || '';

    const timestampEl = item.querySelector('.msg-conversation-card__time-stamp');
    const timestamp = timestampEl?.textContent?.trim() || '';

    const unreadCount = unreadBadge.textContent?.trim() || '1';

    unread.push({
      name,
      lastMessage,
      timestamp,
      unreadCount,
      index
    });
  });

  return unread;
}

export function extractConversationMessages() {
  const messages: any[] = [];
  const messageListItems = document.querySelectorAll('.msg-s-message-list__event');

  // Helper function to convert relative dates to actual dates
  const convertRelativeDate = (dateStr: string): string => {
    const normalized = dateStr.trim().toLowerCase();

    // Check for "Today" in various languages
    if (normalized === "aujourd'hui" || normalized === 'today' || normalized === 'hoy') {
      const today = new Date();
      return formatDate(today);
    }

    // Check for "Yesterday" in various languages
    if (normalized === 'hier' || normalized === 'yesterday' || normalized === 'ayer') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return formatDate(yesterday);
    }

    // Check for weekday names (French, English, Spanish)
    const weekdays = {
      // French
      'lundi': 1, 'mardi': 2, 'mercredi': 3, 'jeudi': 4, 'vendredi': 5, 'samedi': 6, 'dimanche': 0,
      // English
      'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6, 'sunday': 0,
      // Spanish
      'lunes': 1, 'martes': 2, 'miércoles': 3, 'jueves': 4, 'viernes': 5, 'sábado': 6, 'domingo': 0
    };

    const targetDay = weekdays[normalized as keyof typeof weekdays];
    if (targetDay !== undefined) {
      const today = new Date();
      const currentDay = today.getDay();

      // Calculate days difference (going backwards in time)
      let daysDiff = currentDay - targetDay;
      if (daysDiff <= 0) {
        // If target day is today or in the future, go back a week
        daysDiff += 7;
      }

      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() - daysDiff);
      return formatDate(targetDate);
    }

    // Return original if not a relative date
    return dateStr;
  };

  // Helper function to format date as "29 oct."
  const formatDate = (date: Date): string => {
    const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
      'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const day = date.getDate();
    const month = months[date.getMonth()];
    return `${day} ${month}`;
  };

  let currentDay = '';

  messageListItems.forEach((item) => {
    // Check if this item contains a day heading
    const dayHeadingEl = item.querySelector('.msg-s-message-list__time-heading');
    if (dayHeadingEl) {
      const rawDay = dayHeadingEl.textContent?.trim() || '';
      currentDay = convertRelativeDate(rawDay);
    }

    // Extract message content
    const messageEl = item.querySelector('.msg-s-event-listitem__message-bubble p');
    const message = messageEl?.textContent?.trim() || '';

    const senderEl = item.querySelector('.msg-s-message-group__name');
    const sender = senderEl?.textContent?.trim() || '';

    const timeEl = item.querySelector('.msg-s-message-group__timestamp');
    const time = timeEl?.textContent?.trim() || '';

    if (message) {
      // Combine day and time for full timestamp
      const timestamp = currentDay ? `${currentDay} ${time}` : time;

      messages.push({
        sender,
        message,
        timestamp
      });
    }
  });

  return messages;
}

// ============================================================================
// CONNECTION REQUEST FUNCTIONS
// ============================================================================

export function checkConnectionDegree() {
  const degreeEl = document.querySelector('.dist-value');
  return !!degreeEl;
}

export function clickConnectButton() {
  // Try multiple stable selectors for the connect button
  // Priority 1: aria-label containing "Invitez" (Invite) - most stable
  const inviteButton = document.querySelector('button[aria-label*="Invitez"]') as HTMLButtonElement;
  if (inviteButton) {
    inviteButton.click();
    return true;
  }

  // Priority 2: Primary button with "Se connecter" text
  const buttons = Array.from(document.querySelectorAll('button.artdeco-button--primary')) as HTMLButtonElement[];
  for (const button of buttons) {
    const text = button.textContent?.trim();
    const ariaLabel = button.getAttribute('aria-label');
    if (text === 'Se connecter' || text === 'Connect' ||
        ariaLabel?.includes('rejoindre votre réseau')) {
      button.click();
      return true;
    }
  }

  // Priority 3: Any button with connect text (fallback)
  const allButtons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
  for (const button of allButtons) {
    const text = button.textContent?.trim();
    const ariaLabel = button.getAttribute('aria-label');
    if (ariaLabel?.includes('Connect') || ariaLabel?.includes('Inviter') ||
      text?.includes('Se connecter')) {
      button.click();
      return true;
    }
  }

  return false;
}

export function checkAddNoteButton() {
  // Use stable selector: dialog role instead of #artdeco-modal-outlet
  const dialog = document.querySelector('[role="dialog"]');
  if (!dialog) return false;

  // Look for "Add a note" button using aria-label (most stable)
  const addButton = dialog.querySelector('button[aria-label="Ajouter une note"]') ||
                      dialog.querySelector('button[aria-label="Add a note"]');
  if (addButton) return true;

  // Fallback: text content matching
  const buttons = Array.from(dialog.querySelectorAll('button'));
  for (const button of buttons) {
    const text = button.textContent?.trim();
    if (text === 'Ajouter une note' || text === 'Add a note') {
      return true;
    }
  }
  return false;
}

export function clickAddNoteButton() {
  // Use stable selector: dialog role
  const dialog = document.querySelector('[role="dialog"]');
  if (!dialog) return false;

  // Use aria-label selector (most stable)
  const addButton = dialog.querySelector('button[aria-label="Ajouter une note"]') as HTMLButtonElement ||
                      dialog.querySelector('button[aria-label="Add a note"]') as HTMLButtonElement;
  if (addButton) {
    addButton.click();
    return true;
  }

  // Fallback: secondary button with matching text
  const buttons = Array.from(dialog.querySelectorAll('button.artdeco-button--secondary')) as HTMLButtonElement[];
  for (const button of buttons) {
    const text = button.textContent?.trim();
    if (text === 'Ajouter une note' || text === 'Add a note') {
      button.click();
      return true;
    }
  }

  // Last resort: any button with matching text
  const allButtons = Array.from(dialog.querySelectorAll('button')) as HTMLButtonElement[];
  for (const button of allButtons) {
    const text = button.textContent?.trim();
    if (text?.includes('Ajouter une note') || text?.includes('Add a note')) {
      button.click();
      return true;
    }
  }
  return false;
}

export function typeNoteMessage(message: string) {
  // Try multiple selectors for the message textarea
  // Priority 1: ID selector (if still present)
  let textarea = document.querySelector('#custom-message') as HTMLTextAreaElement;

  // Priority 2: Look for textarea in the dialog
  if (!textarea) {
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog) {
      textarea = dialog.querySelector('textarea') as HTMLTextAreaElement;
    }
  }

  // Priority 3: Any textarea in the document
  if (!textarea) {
    textarea = document.querySelector('textarea') as HTMLTextAreaElement;
  }

  if (textarea) {
    textarea.value = message;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  return false;
}

export function clickSendInvitation() {
  // Use stable selector: dialog role
  const dialog = document.querySelector('[role="dialog"]');
  if (!dialog) return false;

  // Use aria-label selector (most stable) - look for send button
  const sendButton = dialog.querySelector('button[aria-label*="Envoyer"]') as HTMLButtonElement ||
                      dialog.querySelector('button[aria-label*="Send"]') as HTMLButtonElement;
  if (sendButton) {
    sendButton.click();
    return true;
  }

  // Fallback: primary button with "Envoyer" or "Send" text
  const buttons = Array.from(dialog.querySelectorAll('button.artdeco-button--primary')) as HTMLButtonElement[];
  for (const button of buttons) {
    const text = button.textContent?.trim();
    const ariaLabel = button.getAttribute('aria-label');
    if (text === 'Envoyer sans note' || text === 'Send' || text.includes('Envoyer') || text.includes('Send') ||
        ariaLabel?.includes('Envoyer') || ariaLabel?.includes('Send')) {
      button.click();
      return true;
    }
  }

  return false;
}

// ============================================================================
// PROFILE VIEWS FUNCTIONS
// ============================================================================

export function extractProfileViews() {
  const nameEl = document.querySelector('h1.text-heading-xlarge');
  const name = nameEl?.textContent?.trim() || '';

  const titleEl = document.querySelector('.text-body-medium.break-words');
  const title = titleEl?.textContent?.trim() || '';

  const viewsEl = document.querySelector('.pvs-header__subtitle');
  const viewsText = viewsEl?.textContent?.trim() || '';

  const views = parseInt(viewsText.match(/\d+/)?.[0] || '0');

  return {
    name,
    title,
    views,
    viewsText
  };
}

// ============================================================================
// SEARCH FUNCTIONS
// ============================================================================

export function extractSearchResults() {
  const results: any[] = [];
  const resultItems = document.querySelectorAll('.reusable-search__result-container');

  resultItems.forEach((item) => {
    const nameEl = item.querySelector('.entity-result__title-text a span[aria-hidden="true"]');
    const name = nameEl?.textContent?.trim() || '';

    const titleEl = item.querySelector('.entity-result__primary-subtitle');
    const title = titleEl?.textContent?.trim() || '';

    const locationEl = item.querySelector('.entity-result__secondary-subtitle');
    const location = locationEl?.textContent?.trim() || '';

    const linkEl = item.querySelector('.entity-result__title-text a') as HTMLAnchorElement;
    const profileUrl = linkEl?.href || '';

    if (name && profileUrl) {
      results.push({
        name,
        title,
        location,
        profileUrl
      });
    }
  });

  return results;
}

export function scrollSearchResults() {
  const resultsContainer = document.querySelector('.search-results-container');
  if (resultsContainer) {
    resultsContainer.scrollTop = resultsContainer.scrollHeight;
    return true;
  }
  return false;
}

// ============================================================================
// MESSAGE SENDING FUNCTIONS
// ============================================================================

export function clickConversationItem(index: number) {
  const convItems = document.querySelectorAll('li.msg-conversation-listitem');
  const item = convItems[index];
  if (item) {
    const linkEl = item.querySelector('.msg-conversation-listitem__link') as HTMLElement;
    if (linkEl) {
      linkEl.click();
      return true;
    }
  }
  return false;
}

// ============================================================================
// CONNECTION STATUS FUNCTIONS
// ============================================================================

export function checkConnectionStatus() {
  console.log('--- Checking Connection Status ---');
  console.log('Current URL:', window.location.href);

  // Debug: Log all buttons with their aria-labels to understand what's available
  const allButtons = Array.from(document.querySelectorAll('button'));
  console.log(`Found ${allButtons.length} total buttons on page`);

  const buttonsWithAriaLabel = allButtons
    .filter(btn => btn.getAttribute('aria-label'))
    .map(btn => ({
      label: btn.getAttribute('aria-label'),
      text: btn.textContent?.trim().substring(0, 50) // First 50 chars
    }));

  // Check if we're on a login/auth page by detecting multiple language selector buttons
  const languageButtons = buttonsWithAriaLabel.filter(btn =>
    btn.label && (
      btn.label.includes('العربية') ||
      btn.label.includes('English') ||
      btn.label.includes('Français') ||
      btn.label.includes('Español') ||
      btn.label.includes('Deutsch')
    )
  );

  // Also check for password field visibility buttons
  const passwordButtons = buttonsWithAriaLabel.filter(btn =>
    btn.label && (
      btn.label.includes('mot de passe') ||
      btn.label.includes('password')
    )
  );

  if (languageButtons.length >= 3 || passwordButtons.length >= 3) {
    console.log('❌ ERROR: Detected login/auth page!');
    console.log(`   Found ${languageButtons.length} language buttons`);
    console.log(`   Found ${passwordButtons.length} password field buttons`);
    return { status: 'not_authenticated', connected: false };
  }

  // Check for 1st degree connection via degree badge
  // Try multiple selectors as LinkedIn's DOM structure varies
  const degreeEl = document.querySelector('.distance-badge .dist-value') ||
    document.querySelector('.dist-value') ||
    document.querySelector('[class*="dist-value"]');
  const degreeText = degreeEl?.textContent?.trim();
  console.log('Degree element found:', !!degreeEl, 'Text:', degreeText);

  if (degreeText === '1er' || degreeText === '1st') {
    console.log('✅ Status determined: connected (1st degree)');
    return { status: 'connected', connected: true };
  }

  // Note: We don't check for Message button because Premium users can message anyone
  // This would give false positives for Premium accounts

  // Check for pending connection - look for clock icon and "En attente"/"Pending" text
  const pendingButton = allButtons.find(btn => {
    const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
    const text = btn.textContent?.trim().toLowerCase() || '';

    // Check for "En attente" or "Pending" in aria-label or text
    const hasPendingText = ariaLabel.includes('pending') ||
      ariaLabel.includes('en attente') ||
      ariaLabel.includes('attente') ||
      text === 'pending' ||
      text === 'en attente';

    // Check for clock icon (pending indicator)
    const hasClockIcon = btn.querySelector('svg[data-test-icon="clock-small"]') !== null;

    return hasPendingText || hasClockIcon;
  });

  if (pendingButton) {
    console.log('⏳ Status determined: pending');
    console.log('   Button aria-label:', pendingButton.getAttribute('aria-label'));
    console.log('   Button text:', pendingButton.textContent?.trim());
    return { status: 'pending', connected: false };
  }

  // Check for connect button
  const connectButton = allButtons.find(btn => {
    const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
    const text = btn.textContent?.toLowerCase() || '';
    return ariaLabel.includes('connect') ||
      ariaLabel.includes('inviter') ||
      ariaLabel.includes('invitez') ||
      text.includes('connect') ||
      text.includes('se connecter');
  });

  if (connectButton) {
    console.log('❌ Status determined: not_connected');
    console.log('   Button aria-label:', connectButton.getAttribute('aria-label'));
    return { status: 'not_connected', connected: false };
  }

  console.log('⚠️  Connection status could not be determined');
  console.log('   No matching buttons found for: message, pending, or connect');
  return { status: 'unknown', connected: false };
}

export function extractProfileName() {
  console.log('--- Extracting Profile Name ---');

  // Try multiple selectors to support different UI types

  // Standard UI: h1 with inline class
  let nameEl = document.querySelector('h1.inline.t-24.v-align-middle.break-words');
  if (nameEl) {
    console.log('✅ Found name using standard UI selector');
  }

  // Premium UI: h1 within the ph5.pb5 container
  if (!nameEl) {
    nameEl = document.querySelector('.ph5.pb5 h1.t-24.v-align-middle.break-words');
    if (nameEl) {
      console.log('✅ Found name using premium UI selector (.ph5.pb5)');
    }
  }

  // Fallback: Any h1 with the specific classes (works for both standard and premium)
  if (!nameEl) {
    nameEl = document.querySelector('h1.t-24.v-align-middle.break-words');
    if (nameEl) {
      console.log('✅ Found name using fallback selector (h1.t-24)');
    }
  }

  // Additional fallback: Look for h1 within profile content
  if (!nameEl) {
    nameEl = document.querySelector('#profile-content h1');
    if (nameEl) {
      console.log('✅ Found name using profile-content selector');
    }
  }

  const name = nameEl?.textContent?.trim() || '';
  console.log('Extracted name:', name || '(empty)');

  return name;
}

export function findAndClickConversationByName(firstName: string, lastName: string) {
  // Normalize search terms (lowercase, trim)
  const searchFirstName = firstName.toLowerCase().trim();
  const searchLastName = lastName.toLowerCase().trim();
  const fullName = `${searchFirstName} ${searchLastName}`;

  // Helper function to search in current visible conversations
  const searchInVisibleConversations = () => {
    const conversationItems = Array.from(document.querySelectorAll('li.msg-conversation-listitem'));

    for (const item of conversationItems) {
      // Get the participant name from the conversation card
      const nameEl = item.querySelector('.msg-conversation-listitem__participant-names .truncate');
      if (!nameEl) continue;

      const participantName = nameEl.textContent?.trim().toLowerCase() || '';

      // Check if the name matches (either "firstname lastname" or "lastname firstname")
      const matchesFullName = participantName.includes(fullName);
      const matchesReversed = participantName.includes(`${searchLastName} ${searchFirstName}`);
      const matchesBoth = participantName.includes(searchFirstName) && participantName.includes(searchLastName);

      if (matchesFullName || matchesReversed || matchesBoth) {
        // Click on the conversation link
        const linkEl = item.querySelector('.msg-conversation-listitem__link') as HTMLElement;
        if (linkEl) {
          linkEl.click();
          return { success: true, name: nameEl.textContent?.trim() };
        }
      }
    }

    return null;
  };

  // First attempt: search in currently visible conversations
  const result = searchInVisibleConversations();
  if (result) return result;

  // If not found, scroll and search up to 5 times
  const conversationList = document.querySelector('.msg-conversations-container__conversations-list');
  if (!conversationList) {
    return { success: false, name: null };
  }

  const maxScrollAttempts = 5;
  for (let i = 0; i < maxScrollAttempts; i++) {
    // Scroll to bottom of conversation list
    conversationList.scrollTop = conversationList.scrollHeight;

    // Wait a bit for new conversations to load (using a simple busy wait)
    const startTime = Date.now();
    while (Date.now() - startTime < 1000) {
      // Busy wait for 1 second
    }

    // Search again in newly loaded conversations
    const scrollResult = searchInVisibleConversations();
    if (scrollResult) return scrollResult;
  }

  return { success: false, name: null };
}
