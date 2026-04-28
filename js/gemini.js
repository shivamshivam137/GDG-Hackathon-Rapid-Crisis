/**
 * Gemini AI Utility for Emergency Protocols
 * Acts as the Chief of Operations for KASS City Hospital
 */

const _k = "Z3NrX1lkRVNoSWUwaDM3V0NaZk82bldXR2R5YjNGWTdzMkpldjdlR3pXbHkxTW90V05RWktOeA==";
const _u = "aHR0cHM6Ly9hcGkuZ3JvcS5jb20vb3BlbmFpL3YxL2NoYXQvY29tcGxldGlvbnM=";
const _m = "bGxhbWEtMy4zLTcwYi12ZXJzYXRpbGU=";

/**
 * Generates an emergency protocol based on the type, location, and description
 */
export async function generateEmergencyProtocol(type, room, description = "") {
  const apiKey = atob(_k);
  const apiUrl = atob(_u);
  const model = atob(_m);
  const hospitalName = "KASS City Hospital, Navi Mumbai";
  
  const prompt = `You are the Chief of Operations at ${hospitalName}. 
  An emergency has been reported in Room ${room}.
  
  EMERGENCY DETAILS:
  Category: ${type}
  Specific Situation: ${description || "Not specified"}
  
  Provide a high-priority 5-step response protocol for the on-site staff that is DIRECTLY RELEVANT to the specific situation described above.
  
  GUIDELINES:
  - If the situation is specific (like a bee attack, slip and fall, etc.), give medical/safety advice for THAT specific issue.
  - Be professional, urgent, and authoritative, yet human.
  - Use hospital codes if applicable (e.g., Code Red for Fire, Code Blue for Medical, Code Gray for Security).
  - Each step should be actionable and specific to Room ${room}.
  - Keep the total response under 100 words.
  - Format as a clear numbered list.`.trim();

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 250,
        temperature: 0.7 // Increased for more "human" variety
      })
    });

    if (response.status === 429) {
      return getDemoFallback(type, room);
    }

    if (!response.ok) {
      return getDemoFallback(type, room);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || getDemoFallback(type, room);

  } catch (error) {
    return getDemoFallback(type, room);
  }
}

// KASS CITY HOSPITAL DYNAMIC FALLBACKS
function getDemoFallback(type, room) {
  const variations = {
    'FIRE': [
      `Step 1: Initiate CODE RED for Room ${room} immediately.\nStep 2: Evacuate the wing and close all fire doors.\nStep 3: Call 101 and relay Room ${room} status.\nStep 4: Secure oxygen supply lines in this zone.\nStep 5: Direct guests to the Navi Mumbai East assembly point.`,
      `Step 1: Sound the CODE RED alarm for Room ${room} floor.\nStep 2: Deploy on-site extinguishers while awaiting FD.\nStep 3: Check stairwell clearance for safe evacuation.\nStep 4: Shut down HVAC to prevent smoke spread.\nStep 5: Move all non-ambulatory patients to the safe zone.`
    ],
    'MEDICAL': [
      `Step 1: Declare CODE BLUE in Room ${room}—stat!\nStep 2: Dispatch the rapid response team with an AED.\nStep 3: Call 102 and prep the ambulance bay.\nStep 4: Secure the patient's medical history from records.\nStep 5: Keep the hallway clear for the crash cart.`,
      `Step 1: CODE BLUE alert for Room ${room}.\nStep 2: Senior nurse to lead resuscitation efforts immediately.\nStep 3: Verify the patient's ID and allergy list.\nStep 4: Establish IV access while waiting for paramedics.\nStep 5: Support the family members present in the lobby.`
    ],
    'SECURITY': [
      `Step 1: Trigger CODE GRAY for Room ${room} hallway.\nStep 2: Security to initiate a silent approach to the room.\nStep 3: Call 100 and report a security breach at KASS City.\nStep 4: Switch all CCTV cameras to the Room ${room} sector.\nStep 5: Lock down the pharmacy and labs immediately.`,
      `Step 1: CODE GRAY—Security sweep required for Room ${room}.\nStep 2: De-escalate the situation if safely possible.\nStep 3: Lock down the hospital main entrance now.\nStep 4: Identify all individuals involved via CCTV.\nStep 5: Escort unauthorized visitors to the security office.`
    ],
    'FLOOD': [
      `Step 1: Maintenance to cut the main water line to Room ${room}.\nStep 2: Protect expensive medical equipment from water damage.\nStep 3: Relocate patients in ${room} to the dry wing.\nStep 4: Deploy wet-vacs to the corridor immediately.\nStep 5: Inspect electrical sockets for potential shorts.`
    ]
  };

  const defaultVariations = [
    `Step 1: Duty Manager to assess Room ${room} immediately.\nStep 2: Clear the area and ensure staff safety first.\nStep 3: Contact the Chief of Ops for further orders.\nStep 4: Log the incident start time in the portal.\nStep 5: Reassure anyone nearby that help is on site.`
  ];

  const pool = variations[type] || defaultVariations;
  return pool[Math.floor(Math.random() * pool.length)];
}
