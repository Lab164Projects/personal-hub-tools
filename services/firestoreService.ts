
import {
    collection,
    onSnapshot,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    query,
    orderBy,
    setDoc
} from "firebase/firestore";
import { db } from "./firebase";
import { LinkItem } from "../types";

const getUserLinksCollection = (userId: string) =>
    collection(db, "users", userId, "links");

// Real-time listener
export const subscribeToLinks = (
    userId: string,
    onUpdate: (links: LinkItem[]) => void,
    onError: (error: any) => void
) => {
    const q = query(getUserLinksCollection(userId), orderBy("addedAt", "desc"));

    return onSnapshot(q, (snapshot) => {
        const links = snapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id // Use Firestore ID as Link ID
        })) as LinkItem[];
        onUpdate(links);
    }, onError);
};

export const addLink = async (userId: string, link: Omit<LinkItem, 'id'>) => {
    // We let Firestore generate the ID, or we can use custom if preferred
    // Using addDoc automatically generates an ID
    const docRef = await addDoc(getUserLinksCollection(userId), link);
    return docRef.id;
};

export const updateLink = async (userId: string, link: LinkItem) => {
    const linkRef = doc(db, "users", userId, "links", link.id);
    // Remove id from data to avoid redundancy
    const { id, ...data } = link;
    await updateDoc(linkRef, data);
};

export const deleteLink = async (userId: string, linkId: string) => {
    const linkRef = doc(db, "users", userId, "links", linkId);
    await deleteDoc(linkRef);
};

// Batch import (for migration)
export const batchImportLinks = async (userId: string, links: LinkItem[]) => {
    const promises = links.map(link => {
        // Use setDoc with specific ID if preserving IDs is important, or addDoc
        const linkRef = doc(db, "users", userId, "links", link.id);
        const { id, ...data } = link;
        return setDoc(linkRef, data);
    });
    await Promise.all(promises);
};
