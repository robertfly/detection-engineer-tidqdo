```
Input: AI Driven Detection Engineering
WHY - Vision & Purpose
1. Purpose & Users
Primary Problem Solved: Manual work done by Detection Engineers in creating, managing and optimizing detections
Target Users: Detection Engineers at large enterprises with mature security operations teams
Value Propositions: Automated system does the following -
Ingests intelligence and converts it into a universal format that can be converted into detections
AI chatbot that helps create and manage detections
Automatically understands whether you have coverage for those detections and highlights those that you do not
Tests your detections to ensure high quality and coverage across MITRE ATT&CK
WHAT - Core Requirements
2. Functional Requirements
Core Features
System must:
Detection Sources - these are places where we get new detections
CTI - threat intelligence that GenAI has parsed to build new detections. This needs the ability to both parse text, but also images and other items in a web page. The end user has the ability to add both PDFs and URLs as new intelligence.
PDF - parse PDFs provided by user to build detections
URLs - parse URLs provided by user to build detections
GitHub
Integration into GitHub to sync detections so we have the latest detections that organization has.
Detections synced by GitHub are by default considered “private” detections
Files
Users can also upload their detection libraries directly into the system.
Detections uploaded via files are by default “private” detections
Public
Top 1000 public threat intelligence sources from blogs such as:
Microsoft - https://www.microsoft.com/en-us/security/blog/
Palo Alto - https://unit42.paloaltonetworks.com/
Sentinel One - https://www.sentinelone.com/labs/
Wiz - https://threats.wiz.io/
Crowdstrike - https://www.crowdstrike.com/blog/category/threat-intel-research/ 
SIGMA HQ - pull detections from public sources of detections, such as https://github.com/SigmaHQ/sigma
Public detections are by default “public” and available to all users on the system
Convert to JSON formatted UDF - all intelligence and detections are parsed into a UDF which can then be used to translate into other detection languages. This UDF format is used to help maintain a place where we do not lose data during translations. Below is an example JSON format for a detection.
{
  "metadata": {
    "id": "UDF-2024-001",
    "version": "1.0.0",
    "type": "detection",
    "name": "Suspicious PowerShell Script Block Logging",
    "description": "Detects attempts to disable PowerShell Script Block Logging through registry modifications",
    "author": {
      "name": "Security Researcher",
      "organization": "Detection Engineering Inc",
      "contact": "research@detection-eng.com"
    },
    "timestamps": {
      "created": "2024-01-19T10:00:00Z",
      "modified": "2024-01-19T10:00:00Z"
    },
    "tags": [
      "powershell",
      "defense-evasion",
      "logging"
    ],
    "attack": [
      {
        "tactic": "defense-evasion",
        "technique": "T1562",
        "subtechnique": "002"
      }
    ]
  },
  "detection": {
    "logic": {
      "conditions": [
        {
          "field": "event_type",
          "operator": "equals",
          "value": "registry_event"
        },
        {
          "field": "registry_key_path",
          "operator": "equals",
          "value": "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows\\PowerShell\\ScriptBlockLogging"
        },
        {
          "field": "registry_value_name",
          "operator": "equals",
          "value": "EnableScriptBlockLogging"
        },
        {
          "field": "registry_value_data",
          "operator": "equals",
          "value": 0
        }
      ]
    },
    "data_model": {
      "event_types": ["registry_event"],
      "field_mappings": {
        "registry_key_path": {
          "type": "string",
          "description": "Full path of registry key",
          "platform_mappings": {
            "windows": "TargetObject",
            "sysmon": "TargetObject"
          }
        }
      }
    }
  },
  "platform_translations": {
    "sigma": {
      "rule": {
        "title": "PowerShell Script Block Logging Disabled",
        "logsource": {
          "product": "windows",
          "category": "registry_event"
        },
        "detection": {
          "selection": {
            "TargetObject": "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\PowerShell\\ScriptBlockLogging\\EnableScriptBlockLogging",
            "Details": "0"
          },
          "condition": "selection"
        }
      }
    },
    "ksql": {
      "query": "SELECT * FROM REGISTRY_EVENTS WHERE registry_key_path = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows\\PowerShell\\ScriptBlockLogging' AND registry_value_name = 'EnableScriptBlockLogging' AND registry_value_data = 0;"
    }
  },
  "validation": {
    "test_cases": [
      {
        "input": {
          "event_type": "registry_event",
          "registry_key_path": "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows\\PowerShell\\ScriptBlockLogging",
          "registry_value_name": "EnableScriptBlockLogging",
          "registry_value_data": 0
        },
        "expected": {
          "should_alert": true,
          "severity": "high"
        }
      }
    ],
    "performance": {
      "complexity": "O(1)",
      "resource_impact": "low",
      "optimization_hints": [
        "Index on registry_key_path recommended"
      ]
    }
  }
}

Workbench - An AI Chatbot that provides a chat interface for detection engineers to answer questions.
Create Detections - create new detections in the language I’ve chosen
Edit Detections - edit and update detections
Search Detections - search the detections you have and see if you’re missing coverage based on MITRE ATT&CK, threat actors or other perspectives.
Threat Actors - answer questions about threat actors in the intelligence you’ve processed
Detection Libraries - these are containers of detections. They could have come from any of the sources above. They are organized via folders.
Collections - a collection of detections
Individual detections - individual detections
Translate - the app should be able to translate across different detection systems. It should be trained on different detection types and be extremely knowledgable similar to a principal detection engineer. When a detection cannot be completely translated over. It should have an explanation as to what didn’t translate and why. Here are some examples of languages it should support.
Yara-L - https://cloud.google.com/chronicle/docs/detection/yara-l-2-0-syntax
SIGMA - https://sigmahq.io/docs/basics/rules.html
KQL - https://learn.microsoft.com/en-us/sharepoint/dev/general-development/keyword-query-language-kql-syntax-reference 
SPL - https://docs.splunk.com/Documentation/SplunkCloud/latest/SearchReference/UnderstandingSPLsyntax 
Community - Community Edition allows communities to form and share detections amongst themselves. It contains some of the features of enterprise edition.
Portal
We need a central public portal, separate from the product and login that’s the community page.
By default a static page appears, but clicking on any links will ask the user to sign in. We will not attempt to restrict who has access.
Sign in performed through a username and password using the same logic we have in the product. It would be a nice to have to support OAuth account creation and login through Google and Microsoft.
User Types
There are two types of users in the community edition.
Public
Community 
Public users can view, rate and chat with “public” detections. Public users cannot upload detections.
Community users can view, rate and chat with “public” detections and any detections that have been shared through their community. These users can also upload detections into the community pool.
By default new users are considered public unless explicitly added to a community.
Community Invite
Communities (such as RH-ISAC are manually created by S2S. Once someone is part of a community, they can invite others into the community.
Inviting others is as simple as adding their email as a community member.
If the invitee already has an account, we should send them an invite email and they will see the community details on their next login. If they do not have an account, we initiate the new account creation flow
Community Sharing
The following types of data can be shared in communities:
Intel Reports
Detections (collections and individual)
Adding Intel
By default community edition does not support adding intel, it needs to be added by someone with the enterprise edition who can share it with the community.
Adding Detections
Detections and collections can be shared after they’ve been added into a community members profile. They simply mark that collection or detection as shared w/community. There is chrome in the UI showing it is shared.
Users can choose to unshare a specific detection.
Notifications
Notification icon and dropdown from header for any important updates (such as user uploaded intelligence is finished)
API to drive all actions
Authenticated API available for all actions in the app
Chrome Extension
Browser Extension to ingest intelligence from a web page and save it as a new detection library
Slack Integration
When new intelligence is imported and their are gaps in detections found based on MITRE ATT&CK coverage, send a Slack notification to the specified channel.


User Capabilities
Users must be able to:
Discover - Search and find detections relevant to your environment
Create - Create detections in workbench based on your queries/requests
Translate - translate intelligence across different query language formats
Transform - take intelligence or other data to create detections environment
Coverage - identify gaps in detections based on intelligence or MITRE ATT&CK
Enrich - Augment detections with additional context from your environment or intelligence for better decision making.
Optimize - Suggest improvements to detection logic for better performance, accuracy, and efficiency, such as reducing false positives.
Explain - Provide context and reasoning for detections, making it easier for engineers to understand and communicate their significance.
Report - Automatically generate comprehensive reports on detection activity, trends, and gaps for stakeholders or compliance purposes.
Triage - Assist in prioritizing detections based on potential impact or relevance to ongoing investigations, reducing noise in alerts.
Correlate - Link multiple detections to identify larger patterns or potential campaigns, uncovering complex or coordinated threats.
HOW - Planning & Implementation
3. Technical Foundation
Required Stack Components
Frontend: Web-based administrative interface using ReactJS
Backend: RESTful API architecture
Storage: Secure document storage system
SIEM Integration: Integration into Splunk Enterprise Security
OCR Engine: Advanced OCR system with ML capabilities
Database: Structured storage for application data
Integrations:
GitHub to integrate with and ingest detection libraries
Slack integration to alert of gaps in detection coverage
System Requirements
Performance: Process intelligence reports within two minutes of ingestion
Security: Encrypted storage, secure API access, audit logging
Scalability: Handle 100 concurrent users
Reliability: 99.9% uptime, 95%+ true positive results on intelligence ingestion
Compliance: Data protection for sensitive financial information
4. User Experience
Primary User Flows
Intelligence Collection
Entry: PDF or URL chosen
Steps: Extract PDF (or URL) -> Review for possible new detections -> Analyze if Detections already exist -> Create Detections -> Send Notification
Success: All detections built and intelligence is processed
Alternative: Retry mechanism for failed parsing
Sources
Entry: GitHub integration setup and syncing detections
Steps: Add integration -> Sources Updated
Success: Real-time updates received
Alternative: Retry mechanism for failure
Detection Management
Entry: Sources synced, coverage investigated
Steps: View application -> Sources synced -> Coverage map available
Success: Verified application data
Alternative: Manual data correction
AI Chatbot
Entry: Left navbar clicked
Steps: Ask question to chatbot -> iterate towards answer
Success: Successful answer
Alternative: Retry mechanism for failure
Core Interfaces
Dashboard: Application overview, processing status, recent activities
Application Views:
AI Workbench: Chatbot to create, edit, and manage detections
Sources: CTI sources, private GitHub, public repos or file uploads
Detection Libraries: All collections and detections from sources above
Account Settings: personal settings such as name, email, password, etc
Admin Settings: add/remove users
Integration: setup integrations for Slack, SIEMs (Splunk), Code Repos (Github)
Support Docs: basic support documentation for the application
API Documentation: interactive API docs
5. Business Requirements
Access Control
Multitenancy: Separated by companies
User Types: Administrators, API users, community users
Authentication: API keys for programmatic access, user credentials for UI
Authorization: Role-based access control
The chart below shows access levels based on edition.
Action
Community 
Enterprise 
Discover
✅
✅
Create
✅
✅
Transform
❌
✅
Translate
❌
✅
Coverage
❌
✅
Enrich
❌
✅
Optimize
❌
✅
Explain
❌
✅
Report
❌
✅
Triage
❌
✅
Correlate
❌
✅


Business Rules
Data Validation: Verification of extracted data against expected formats
Compliance: Secure handling of all data
6. Implementation Priorities
High Priority (Must Have)
Web interface
Detection Sources
Workbench
Detection Libraries
Integrations
Structured intelligence extraction and detections created
Community Edition
Actions available using GenAI
Discover - Search and find detections relevant to your environment
Create - Create detections in workbench based on your queries/requests
Translate - translate intelligence across different query language formats
Transform - take intelligence or other data to create detections environment
Coverage - identify gaps in detections based on intelligence or MITRE ATT&CK
Enrich - Augment detections with additional context from your environment or intelligence for better decision making.
Optimize - Suggest improvements to detection logic for better performance, accuracy, and efficiency, such as reducing false positives.
Explain - Provide context and reasoning for detections, making it easier for engineers to understand and communicate their significance.
Report - Automatically generate comprehensive reports on detection activity, trends, and gaps for stakeholders or compliance purposes.
Triage - Assist in prioritizing detections based on potential impact or relevance to ongoing investigations, reducing noise in alerts.
Correlate - Link multiple detections to identify larger patterns or potential campaigns, uncovering complex or coordinated threats.

Medium Priority (Should Have)
Community edition user types (public and community)
Notifications
API documentation portal
Support Portal
Slack App
Chrome Extension
Lower Priority (Nice to Have)
Advanced analytics dashboard
SIEM field and index mapping
```