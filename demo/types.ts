// Type definitions for EMS data

// Employee ID type
export type EmployeeId = string;

// Employee record
export interface DemoEmployee {
    id: EmployeeId;
    name: string;
    position: string;
    department: string;
}

// Asset resource record
export interface DemoAssetResource {
    id: string;
    name: string;
    type: string;
    status: string;
}

// Approval stages
export enum ApprovalStage {
    Pending,
    Approved,
    Rejected,
}

// Approval action payload
export interface ApprovalActionPayload {
    employeeId: EmployeeId;
    approvalStage: ApprovalStage;
}

// Event record
export interface DemoEvent {
    id: string;
    title: string;
    start: Date;
    end: Date;
}

// Note record
export interface DemoNote {
    id: string;
    content: string;
}

// Notes map
export interface DemoNotesMap {
    [key: string]: DemoNote;
}

// Category record
export interface DemoCategory {
    id: string;
    name: string;
}

// Pool record
export interface DemoPool {
    id: string;
    name: string;
}

// Profile record
export interface DemoProfile {
    employeeId: EmployeeId;
    skills: string[];
    certifications: string[];
}

// EMS data record types
export interface RegionRecord {
    id: string;
    name: string;
}

export interface BaseRecord {
    id: string;
    createdAt: Date;
}

export interface AssetRecord extends BaseRecord {
    assetId: string;
    resource: DemoAssetResource;
}

export interface PilotRecord extends BaseRecord {
    pilotId: string;
    hoursFlown: number;
}

export interface MedicalRecord extends BaseRecord {
    recordId: string;
    medicalHistory: string;
}

export interface MechanicRecord extends BaseRecord {
    mechanicId: string;
    maintenanceRecord: string;
}

export interface ShiftRecord extends BaseRecord {
    shiftId: string;
    schedule: Date[];
}

export interface MaintenanceRecord extends BaseRecord {
    maintenanceId: string;
    status: string;
}

export interface RequestRecord extends BaseRecord {
    requestId: string;
    details: string;
}

export interface MissionLeg {
    id: string;
    departure: string;
    arrival: string;
}

export interface CrewAssignment {
    crewId: string;
    memberIds: EmployeeId[];
}

export interface ComplianceItem {
    itemId: string;
    status: string;
}

export interface MissionRecord extends BaseRecord {
    missionId: string;
    legs: MissionLeg[];
}
