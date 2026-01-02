/**
 * Unit tests for LinkedIn DOM extraction functions
 * Uses mock DOM to test extraction logic
 */

import * as DOMFunctions from '../../src/utils/linkedin-dom-functions';

// Helper to create mock DOM elements
function createMockElement(html: string) {
  const template = document.createElement('div');
  template.innerHTML = html;
  return template;
}

describe('LinkedIn DOM Functions', () => {
  let originalDocument: Document;

  beforeAll(() => {
    originalDocument = global.document;
  });

  afterAll(() => {
    global.document = originalDocument;
  });

  describe('extractProfileData', () => {
    it('should extract complete profile data', () => {
      document.body.innerHTML = `
        <h1 class="t-24 v-align-middle break-words">John Doe</h1>
        <div class="text-body-medium" data-generated-suggestion-target>Senior Software Engineer</div>
        <span class="text-body-small inline t-black--light break-words">San Francisco, CA</span>
        <li class="text-body-small">
          <a href="/connectionOf">500+ connections</a>
        </li>
        <img class="pv-top-card-profile-picture__image--show" src="profile.jpg" />
        <img id="profile-background-image-target-image" src="background.jpg" />
        <section>
          <div id="about"></div>
          <div class="inline-show-more-text">
            <span aria-hidden="true">Passionate software engineer</span>
          </div>
        </section>
        <section>
          <div id="education"></div>
          <ul>
            <li class="artdeco-list__item">
              <div class="display-flex align-items-center mr1 hoverable-link-text t-bold">
                <span aria-hidden="true">MIT</span>
              </div>
              <span class="t-14 t-normal">
                <span aria-hidden="true">BS Computer Science</span>
              </span>
            </li>
          </ul>
        </section>
        <section>
          <div id="experience"></div>
          <ul>
            <li class="artdeco-list__item">
              <div class="display-flex align-items-center mr1 hoverable-link-text t-bold">
                <span aria-hidden="true">Senior Engineer</span>
              </div>
              <span class="t-14 t-normal">
                <span aria-hidden="true">Tech Corp</span>
              </span>
            </li>
          </ul>
        </section>
        <section>
          <div id="skills"></div>
          <div class="display-flex align-items-center mr1 hoverable-link-text t-bold">
            <span aria-hidden="true">JavaScript</span>
          </div>
        </section>
      `;

      const result = DOMFunctions.extractProfileData();

      expect(result.name).toBe('John Doe');
      expect(result.title).toBe('Senior Software Engineer');
      expect(result.location).toBe('San Francisco, CA');
      expect(result.connections).toBe('500+ connections');
      expect(result.profileImage).toContain('profile.jpg');
      expect(result.backgroundImage).toContain('background.jpg');
      expect(result.about).toBe('Passionate software engineer');
      expect(result.education).toHaveLength(1);
      expect(result.experience).toHaveLength(1);
      expect(result.skills).toHaveLength(1);
    });

    it('should handle missing profile elements', () => {
      document.body.innerHTML = '<div></div>';

      const result = DOMFunctions.extractProfileData();

      expect(result.name).toBe('');
      expect(result.title).toBe('');
      expect(result.location).toBe('');
      expect(result.connections).toBe('');
      expect(result.education).toEqual([]);
      expect(result.experience).toEqual([]);
      expect(result.skills).toEqual([]);
    });

    it('should extract multiple education entries', () => {
      document.body.innerHTML = `
        <section>
          <div id="education"></div>
          <ul>
            <li class="artdeco-list__item">
              <div class="display-flex align-items-center mr1 hoverable-link-text t-bold">
                <span aria-hidden="true">MIT</span>
              </div>
              <span class="t-14 t-normal">
                <span aria-hidden="true">BS Computer Science</span>
              </span>
            </li>
            <li class="artdeco-list__item">
              <div class="display-flex align-items-center mr1 hoverable-link-text t-bold">
                <span aria-hidden="true">Stanford</span>
              </div>
              <span class="t-14 t-normal">
                <span aria-hidden="true">MS AI</span>
              </span>
            </li>
          </ul>
        </section>
      `;

      const result = DOMFunctions.extractProfileData();

      expect(result.education).toHaveLength(2);
      expect(result.education[0].school).toBe('MIT');
      expect(result.education[1].school).toBe('Stanford');
    });
  });

  describe('extractConversationsList', () => {
    it('should extract conversation list', () => {
      document.body.innerHTML = `
        <li class="msg-conversation-listitem">
          <div class="msg-conversation-card__participant-names">
            <span class="truncate">John Doe</span>
          </div>
          <div class="msg-conversation-card__message-snippet">Hello there</div>
          <time class="msg-conversation-card__time-stamp">10:30 AM</time>
        </li>
        <li class="msg-conversation-listitem">
          <div class="msg-conversation-card__participant-names">
            <span class="truncate">Jane Smith</span>
          </div>
          <div class="msg-conversation-card__message-snippet">Vous : Hi back</div>
          <time class="msg-conversation-card__time-stamp">10:32 AM</time>
        </li>
      `;

      const result = DOMFunctions.extractConversationsList();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('John Doe');
      expect(result[0].lastMessage).toBe('Hello there');
      expect(result[0].lastMessageSentByYou).toBe(false);
      expect(result[1].name).toBe('Jane Smith');
      expect(result[1].lastMessageSentByYou).toBe(true);
    });

    it('should detect unread conversations', () => {
      document.body.innerHTML = `
        <li class="msg-conversation-listitem">
          <div class="msg-conversation-card__participant-names">
            <span class="truncate">John Doe</span>
          </div>
          <div class="msg-conversation-card__message-snippet">Unread message</div>
          <time class="msg-conversation-card__time-stamp">10:30 AM</time>
          <div class="msg-conversation-card__unread-count">1</div>
        </li>
      `;

      const result = DOMFunctions.extractConversationsList();

      expect(result[0].isUnread).toBe(true);
    });

    it('should handle empty conversation list', () => {
      document.body.innerHTML = '<div></div>';

      const result = DOMFunctions.extractConversationsList();

      expect(result).toEqual([]);
    });
  });

  describe('extractUnreadConversations', () => {
    it('should extract only unread conversations', () => {
      document.body.innerHTML = `
        <li class="msg-conversation-listitem">
          <div class="msg-conversation-card__participant-names">
            <span class="truncate">John Doe</span>
          </div>
          <div class="msg-conversation-card__message-snippet">Unread</div>
          <time class="msg-conversation-card__time-stamp">10:30 AM</time>
          <div class="msg-conversation-card__unread-count">2</div>
        </li>
        <li class="msg-conversation-listitem">
          <div class="msg-conversation-card__participant-names">
            <span class="truncate">Jane Smith</span>
          </div>
          <div class="msg-conversation-card__message-snippet">Read</div>
          <time class="msg-conversation-card__time-stamp">10:32 AM</time>
        </li>
      `;

      const result = DOMFunctions.extractUnreadConversations();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('John Doe');
      expect(result[0].unreadCount).toBe('2');
    });
  });

  describe('extractConversationMessages', () => {
    it('should extract messages from conversation', () => {
      document.body.innerHTML = `
        <div class="msg-s-message-list__event">
          <div class="msg-s-event-listitem__message-bubble">
            <p>Hello, how are you?</p>
          </div>
          <div class="msg-s-message-group__name">John Doe</div>
          <div class="msg-s-message-group__timestamp">10:30 AM</div>
        </div>
        <div class="msg-s-message-list__event">
          <div class="msg-s-event-listitem__message-bubble">
            <p>I'm doing great!</p>
          </div>
          <div class="msg-s-message-group__name">Me</div>
          <div class="msg-s-message-group__timestamp">10:32 AM</div>
        </div>
      `;

      const result = DOMFunctions.extractConversationMessages();

      expect(result).toHaveLength(2);
      expect(result[0].message).toBe('Hello, how are you?');
      expect(result[0].sender).toBe('John Doe');
      expect(result[1].message).toBe("I'm doing great!");
    });

    it('should convert "Today" to actual date', () => {
      document.body.innerHTML = `
        <div class="msg-s-message-list__event">
          <div class="msg-s-message-list__time-heading">Aujourd'hui</div>
        </div>
        <div class="msg-s-message-list__event">
          <div class="msg-s-event-listitem__message-bubble">
            <p>Test message</p>
          </div>
          <div class="msg-s-message-group__name">John</div>
          <div class="msg-s-message-group__timestamp">10:30</div>
        </div>
      `;

      const result = DOMFunctions.extractConversationMessages();
      
      expect(result).toHaveLength(1);
      // Should contain a formatted date like "8 nov."
      expect(result[0].timestamp).toMatch(/\d+ \w+\. 10:30/);
    });

    it('should convert "Yesterday" to actual date', () => {
      document.body.innerHTML = `
        <div class="msg-s-message-list__event">
          <div class="msg-s-message-list__time-heading">Hier</div>
        </div>
        <div class="msg-s-message-list__event">
          <div class="msg-s-event-listitem__message-bubble">
            <p>Test message</p>
          </div>
          <div class="msg-s-message-group__name">John</div>
          <div class="msg-s-message-group__timestamp">15:00</div>
        </div>
      `;

      const result = DOMFunctions.extractConversationMessages();
      
      expect(result).toHaveLength(1);
      // Should contain a formatted date like "7 nov."
      expect(result[0].timestamp).toMatch(/\d+ \w+\. 15:00/);
    });

    it('should convert weekday names to actual dates (French)', () => {
      document.body.innerHTML = `
        <div class="msg-s-message-list__event">
          <div class="msg-s-message-list__time-heading">lundi</div>
        </div>
        <div class="msg-s-message-list__event">
          <div class="msg-s-event-listitem__message-bubble">
            <p>Monday message</p>
          </div>
          <div class="msg-s-message-group__name">John</div>
          <div class="msg-s-message-group__timestamp">09:00</div>
        </div>
      `;

      const result = DOMFunctions.extractConversationMessages();
      
      expect(result).toHaveLength(1);
      // Should contain a formatted date like "4 nov." or "29 déc."
      expect(result[0].timestamp).toMatch(/\d+ .+\. 09:00/);
      expect(result[0].message).toBe('Monday message');
    });

    it('should convert weekday names to actual dates (English)', () => {
      document.body.innerHTML = `
        <div class="msg-s-message-list__event">
          <div class="msg-s-message-list__time-heading">Wednesday</div>
        </div>
        <div class="msg-s-message-list__event">
          <div class="msg-s-event-listitem__message-bubble">
            <p>Midweek message</p>
          </div>
          <div class="msg-s-message-group__name">Jane</div>
          <div class="msg-s-message-group__timestamp">14:30</div>
        </div>
      `;

      const result = DOMFunctions.extractConversationMessages();
      
      expect(result).toHaveLength(1);
      // Should contain a formatted date like "31 déc." or "31 Dec."
      expect(result[0].timestamp).toMatch(/\d+ .+\. 14:30/);
      expect(result[0].message).toBe('Midweek message');
    });

    it('should handle empty conversation', () => {
      document.body.innerHTML = '<div></div>';

      const result = DOMFunctions.extractConversationMessages();

      expect(result).toEqual([]);
    });
  });

  describe('checkConnectionDegree', () => {
    it('should return true when degree element exists', () => {
      document.body.innerHTML = '<div class="dist-value">2nd</div>';

      const result = DOMFunctions.checkConnectionDegree();

      expect(result).toBe(true);
    });

    it('should return false when degree element does not exist', () => {
      document.body.innerHTML = '<div></div>';

      const result = DOMFunctions.checkConnectionDegree();

      expect(result).toBe(false);
    });
  });

  describe('clickConnectButton', () => {
    it('should find and click connect button by aria-label', () => {
      const button = document.createElement('button');
      button.setAttribute('aria-label', 'Connect with John');
      button.click = jest.fn();
      document.body.appendChild(button);

      const result = DOMFunctions.clickConnectButton();

      expect(result).toBe(true);
      expect(button.click).toHaveBeenCalled();
    });

    it('should find and click connect button by text content', () => {
      document.body.innerHTML = '<button>Connect</button>';
      const button = document.querySelector('button') as HTMLButtonElement;
      const clickSpy = jest.spyOn(button, 'click');

      const result = DOMFunctions.clickConnectButton();

      expect(result).toBe(true);
      expect(clickSpy).toHaveBeenCalled();
    });

    it('should return false when no connect button found', () => {
      document.body.innerHTML = '<button>Other Action</button>';

      const result = DOMFunctions.clickConnectButton();

      expect(result).toBe(false);
    });
  });

  describe('checkAddNoteButton', () => {
    it('should return true when add note button exists', () => {
      document.body.innerHTML = `
        <div id="artdeco-modal-outlet">
          <button>Add a note</button>
        </div>
      `;

      const result = DOMFunctions.checkAddNoteButton();

      expect(result).toBe(true);
    });

    it('should return false when modal does not exist', () => {
      document.body.innerHTML = '<div></div>';

      const result = DOMFunctions.checkAddNoteButton();

      expect(result).toBe(false);
    });
  });

  describe('clickAddNoteButton', () => {
    it('should click add note button', () => {
      const button = document.createElement('button');
      button.textContent = 'Add a note';
      button.click = jest.fn();
      const modal = document.createElement('div');
      modal.id = 'artdeco-modal-outlet';
      modal.appendChild(button);
      document.body.appendChild(modal);

      const result = DOMFunctions.clickAddNoteButton();

      expect(result).toBe(true);
      expect(button.click).toHaveBeenCalled();
    });
  });

  describe('typeNoteMessage', () => {
    it('should type message into textarea', () => {
      const textarea = document.createElement('textarea');
      textarea.id = 'custom-message';
      textarea.dispatchEvent = jest.fn();
      document.body.appendChild(textarea);

      const result = DOMFunctions.typeNoteMessage('Hello, let\'s connect!');

      expect(result).toBe(true);
      expect(textarea.value).toBe("Hello, let's connect!");
      expect(textarea.dispatchEvent).toHaveBeenCalled();
    });

    it('should return false when textarea not found', () => {
      document.body.innerHTML = '<div></div>';

      const result = DOMFunctions.typeNoteMessage('Test');

      expect(result).toBe(false);
    });
  });

  describe('clickSendInvitation', () => {
    it('should click send button', () => {
      const button = document.createElement('button');
      button.setAttribute('aria-label', 'Send invitation');
      button.click = jest.fn();
      const modal = document.createElement('div');
      modal.id = 'artdeco-modal-outlet';
      modal.appendChild(button);
      document.body.appendChild(modal);

      const result = DOMFunctions.clickSendInvitation();

      expect(result).toBe(true);
      expect(button.click).toHaveBeenCalled();
    });
  });

  describe('extractProfileViews', () => {
    it('should extract profile views data', () => {
      document.body.innerHTML = `
        <h1 class="text-heading-xlarge">John Doe</h1>
        <div class="text-body-medium break-words">Software Engineer</div>
        <div class="pvs-header__subtitle">150 profile views</div>
      `;

      const result = DOMFunctions.extractProfileViews();

      expect(result.name).toBe('John Doe');
      expect(result.title).toBe('Software Engineer');
      expect(result.views).toBe(150);
    });

    it('should handle missing views data', () => {
      document.body.innerHTML = '<div></div>';

      const result = DOMFunctions.extractProfileViews();

      expect(result.name).toBe('');
      expect(result.views).toBe(0);
    });
  });

  describe('extractSearchResults', () => {
    it('should extract search results', () => {
      document.body.innerHTML = `
        <div class="reusable-search__result-container">
          <div class="entity-result__title-text">
            <a href="https://linkedin.com/in/johndoe">
              <span aria-hidden="true">John Doe</span>
            </a>
          </div>
          <div class="entity-result__primary-subtitle">Software Engineer</div>
          <div class="entity-result__secondary-subtitle">San Francisco</div>
        </div>
        <div class="reusable-search__result-container">
          <div class="entity-result__title-text">
            <a href="https://linkedin.com/in/janesmith">
              <span aria-hidden="true">Jane Smith</span>
            </a>
          </div>
          <div class="entity-result__primary-subtitle">Product Manager</div>
          <div class="entity-result__secondary-subtitle">New York</div>
        </div>
      `;

      const result = DOMFunctions.extractSearchResults();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('John Doe');
      expect(result[0].title).toBe('Software Engineer');
      expect(result[0].location).toBe('San Francisco');
      expect(result[1].name).toBe('Jane Smith');
    });

    it('should handle empty search results', () => {
      document.body.innerHTML = '<div></div>';

      const result = DOMFunctions.extractSearchResults();

      expect(result).toEqual([]);
    });
  });

  describe('scrollSearchResults', () => {
    it('should scroll search results container', () => {
      const container = document.createElement('div');
      container.className = 'search-results-container';
      container.scrollTop = 0;
      Object.defineProperty(container, 'scrollHeight', { value: 1000, writable: true });
      document.body.appendChild(container);

      const result = DOMFunctions.scrollSearchResults();

      expect(result).toBe(true);
      expect(container.scrollTop).toBe(1000);
    });

    it('should return false when container not found', () => {
      document.body.innerHTML = '<div></div>';

      const result = DOMFunctions.scrollSearchResults();

      expect(result).toBe(false);
    });
  });

  describe('clickConversationItem', () => {
    it('should click conversation item by index', () => {
      const link = document.createElement('div');
      link.className = 'msg-conversation-listitem__link';
      link.click = jest.fn();
      const item = document.createElement('li');
      item.className = 'msg-conversation-listitem';
      item.appendChild(link);
      document.body.appendChild(item);

      const result = DOMFunctions.clickConversationItem(0);

      expect(result).toBe(true);
      expect(link.click).toHaveBeenCalled();
    });

    it('should return false when item not found', () => {
      document.body.innerHTML = '<div></div>';

      const result = DOMFunctions.clickConversationItem(0);

      expect(result).toBe(false);
    });
  });

  describe('extractProfileName', () => {
    it('should extract name from standard UI', () => {
      document.body.innerHTML = `
        <h1 class="inline t-24 v-align-middle break-words">John Doe</h1>
      `;

      const result = DOMFunctions.extractProfileName();

      expect(result).toBe('John Doe');
    });

    it('should extract name from premium UI', () => {
      document.body.innerHTML = `
        <div class="ph5 pb5">
          <h1 class="t-24 v-align-middle break-words">Victor Poulain</h1>
        </div>
      `;

      const result = DOMFunctions.extractProfileName();

      expect(result).toBe('Victor Poulain');
    });

    it('should extract name using fallback selector', () => {
      document.body.innerHTML = `
        <h1 class="t-24 v-align-middle break-words">Jane Smith</h1>
      `;

      const result = DOMFunctions.extractProfileName();

      expect(result).toBe('Jane Smith');
    });

    it('should extract name from profile-content container', () => {
      document.body.innerHTML = `
        <div id="profile-content">
          <h1>Bob Johnson</h1>
        </div>
      `;

      const result = DOMFunctions.extractProfileName();

      expect(result).toBe('Bob Johnson');
    });

    it('should return empty string when name not found', () => {
      document.body.innerHTML = '<div></div>';

      const result = DOMFunctions.extractProfileName();

      expect(result).toBe('');
    });
  });
});
