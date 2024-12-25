"""
Prompt templates and formatting functions for GenAI operations including detection creation,
intelligence processing, and translations.

Versions:
- string: 3.11+
- json: 3.11+
"""

from string import Template
import json
from functools import cache
from typing import List, Dict, Optional

from app.core.logging import get_logger

# Initialize logger
logger = get_logger(__name__)

# System message templates for different AI roles
SYSTEM_MESSAGES = {
    'detection': '''You are an expert detection engineer specializing in creating high-quality, 
    performant detection rules. Focus on accuracy, performance, and false positive reduction.''',
    
    'translation': '''You are an expert in security platform detection languages and formats. 
    Ensure precise translation while preserving detection logic and performance characteristics.''',
    
    'intelligence': '''You are an expert threat analyst specializing in extracting actionable 
    detection opportunities from threat intelligence. Focus on practical, implementable detections.'''
}

# Prompt templates with detailed instructions
DETECTION_PROMPT_TEMPLATE = Template('''
Create a production-ready detection rule for the following threat:
${threat_description}

Target Platform: ${platform}
Required Fields: ${required_fields}

Requirements:
- Optimize for performance and minimal false positives
- Include comprehensive field mappings
- Add relevant MITRE ATT&CK mappings
- Include detection testing guidance

Output Format: JSON with the following structure:
{
    "name": "string",
    "description": "string",
    "platform": "string",
    "logic": {},
    "mitre_attack": [],
    "fields": {},
    "testing": {}
}
''')

TRANSLATION_PROMPT_TEMPLATE = Template('''
Translate the following detection rule while preserving its detection logic:

Original Detection:
${detection}

Source Platform: ${source_platform}
Target Platform: ${target_platform}

Requirements:
- Maintain detection efficacy
- Optimize for target platform
- Preserve field mappings
- Include performance notes

Output Format: JSON with the following structure:
{
    "original_detection": {},
    "translated_detection": {},
    "performance_notes": "string",
    "field_mappings": {}
}
''')

INTELLIGENCE_PROMPT_TEMPLATE = Template('''
Extract detection opportunities from the following threat intelligence:

Intelligence Text:
${intelligence_text}

Focus Areas: ${focus_areas}

Requirements:
- Extract specific IOCs and behaviors
- Identify detection opportunities
- Map to MITRE ATT&CK
- Assess implementation difficulty

Output Format: JSON with the following structure:
{
    "extracted_iocs": [],
    "detection_opportunities": [],
    "mitre_mappings": [],
    "implementation_notes": "string"
}
''')

# Maximum prompt length to prevent token limit issues
MAX_PROMPT_LENGTH = 4096

# Platform schema requirements
PLATFORM_SCHEMAS = {
    'splunk': {
        'required_fields': ['search', 'earliest_time', 'latest_time'],
        'query_language': 'SPL',
        'field_format': 'key=value'
    },
    'elastic': {
        'required_fields': ['query', 'language', 'timestamp_field'],
        'query_language': 'KQL/EQL',
        'field_format': 'field: value'
    },
    'sentinel': {
        'required_fields': ['query', 'queryFrequency', 'queryPeriod'],
        'query_language': 'KQL',
        'field_format': 'field == value'
    }
}

def validate_inputs(func):
    """Decorator for input validation with logging"""
    def wrapper(*args, **kwargs):
        logger.info(f"Validating inputs for {func.__name__}")
        
        # Validate string inputs aren't empty
        for arg in args:
            if isinstance(arg, str) and not arg.strip():
                logger.error(f"Empty string argument passed to {func.__name__}")
                raise ValueError("String arguments cannot be empty")
        
        # Validate lists aren't empty
        for arg in args:
            if isinstance(arg, list) and not arg:
                logger.error(f"Empty list argument passed to {func.__name__}")
                raise ValueError("List arguments cannot be empty")
        
        return func(*args, **kwargs)
    return wrapper

@validate_inputs
def format_detection_prompt(threat_description: str, platform: str, 
                          required_fields: List[str]) -> List[Dict]:
    """
    Format prompt for detection creation with enhanced validation and logging.
    
    Args:
        threat_description: Description of the threat to detect
        platform: Target detection platform
        required_fields: List of required fields for the detection
    
    Returns:
        List of formatted messages for chat completion
    """
    logger.info("Formatting detection prompt")
    
    # Validate platform
    if not validate_platform(platform):
        raise ValueError(f"Unsupported platform: {platform}")
    
    # Format required fields as JSON string
    fields_str = json.dumps(required_fields)
    
    # Create prompt using template
    prompt = DETECTION_PROMPT_TEMPLATE.substitute(
        threat_description=threat_description,
        platform=platform,
        required_fields=fields_str
    )
    
    # Validate prompt length
    if len(prompt) > MAX_PROMPT_LENGTH:
        logger.error("Detection prompt exceeds maximum length")
        raise ValueError("Prompt exceeds maximum length")
    
    messages = [
        {"role": "system", "content": SYSTEM_MESSAGES['detection']},
        {"role": "user", "content": prompt}
    ]
    
    logger.info("Successfully formatted detection prompt")
    return messages

@validate_inputs
def format_translation_prompt(detection: str, source_platform: str,
                            target_platform: str) -> List[Dict]:
    """
    Format prompt for detection translation with platform validation.
    
    Args:
        detection: Original detection rule
        source_platform: Source platform
        target_platform: Target platform
    
    Returns:
        List of formatted messages for chat completion
    """
    logger.info("Formatting translation prompt")
    
    # Validate platforms
    for platform in [source_platform, target_platform]:
        if not validate_platform(platform):
            raise ValueError(f"Unsupported platform: {platform}")
    
    # Validate detection JSON format
    try:
        if isinstance(detection, str):
            json.loads(detection)
    except json.JSONDecodeError:
        logger.error("Invalid detection JSON format")
        raise ValueError("Detection must be valid JSON")
    
    prompt = TRANSLATION_PROMPT_TEMPLATE.substitute(
        detection=detection,
        source_platform=source_platform,
        target_platform=target_platform
    )
    
    if len(prompt) > MAX_PROMPT_LENGTH:
        logger.error("Translation prompt exceeds maximum length")
        raise ValueError("Prompt exceeds maximum length")
    
    messages = [
        {"role": "system", "content": SYSTEM_MESSAGES['translation']},
        {"role": "user", "content": prompt}
    ]
    
    logger.info("Successfully formatted translation prompt")
    return messages

@validate_inputs
def format_intelligence_prompt(intelligence_text: str, 
                             focus_areas: List[str]) -> List[Dict]:
    """
    Format prompt for intelligence processing with focus area validation.
    
    Args:
        intelligence_text: Raw intelligence text
        focus_areas: List of focus areas for extraction
    
    Returns:
        List of formatted messages for chat completion
    """
    logger.info("Formatting intelligence prompt")
    
    # Validate intelligence text length
    if not 10 <= len(intelligence_text) <= MAX_PROMPT_LENGTH:
        logger.error("Intelligence text length invalid")
        raise ValueError("Intelligence text length must be between 10 and 4096 characters")
    
    # Format focus areas
    focus_areas_str = ", ".join(focus_areas)
    
    prompt = INTELLIGENCE_PROMPT_TEMPLATE.substitute(
        intelligence_text=intelligence_text,
        focus_areas=focus_areas_str
    )
    
    if len(prompt) > MAX_PROMPT_LENGTH:
        logger.error("Intelligence prompt exceeds maximum length")
        raise ValueError("Prompt exceeds maximum length")
    
    messages = [
        {"role": "system", "content": SYSTEM_MESSAGES['intelligence']},
        {"role": "user", "content": prompt}
    ]
    
    logger.info("Successfully formatted intelligence prompt")
    return messages

@cache
def validate_platform(platform: str) -> bool:
    """
    Validate platform support and schema with enhanced error handling.
    
    Args:
        platform: Platform name to validate
    
    Returns:
        bool: True if platform is valid
    """
    logger.info(f"Validating platform: {platform}")
    
    try:
        if platform not in PLATFORM_SCHEMAS:
            logger.error(f"Unsupported platform: {platform}")
            return False
        
        # Validate platform schema structure
        schema = PLATFORM_SCHEMAS[platform]
        required_keys = {'required_fields', 'query_language', 'field_format'}
        
        if not all(key in schema for key in required_keys):
            logger.error(f"Invalid platform schema for {platform}")
            return False
        
        logger.info(f"Successfully validated platform: {platform}")
        return True
        
    except Exception as e:
        logger.error(f"Platform validation error: {str(e)}")
        return False