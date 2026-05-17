package com.spatialmeet.repository;

import com.spatialmeet.model.User;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Pure in-memory user store — no MongoDB needed.
 */
public class UserRepository {

    private final Map<String, User> storeById = new ConcurrentHashMap<>();
    private final Map<String, String> usernameIndex = new ConcurrentHashMap<>(); // username -> id
    private final Map<String, String> emailIndex = new ConcurrentHashMap<>();    // email -> id

    public Optional<User> findById(String id) {
        return Optional.ofNullable(storeById.get(id));
    }

    public User save(User user) {
        // Ensure user has an ID
        if (user.getId() == null || user.getId().isEmpty()) {
            user.setId(UUID.randomUUID().toString());
        }
        storeById.put(user.getId(), user);
        if (user.getUsername() != null) {
            usernameIndex.put(user.getUsername().toLowerCase(), user.getId());
        }
        if (user.getEmail() != null) {
            emailIndex.put(user.getEmail().toLowerCase(), user.getId());
        }
        return user;
    }

    public void delete(User user) {
        storeById.remove(user.getId());
        if (user.getUsername() != null) usernameIndex.remove(user.getUsername().toLowerCase());
        if (user.getEmail() != null) emailIndex.remove(user.getEmail().toLowerCase());
    }

    public Optional<User> findByUsername(String username) {
        if (username == null) return Optional.empty();
        String id = usernameIndex.get(username.toLowerCase());
        return Optional.ofNullable(id != null ? storeById.get(id) : null);
    }

    public Optional<User> findByEmail(String email) {
        if (email == null) return Optional.empty();
        String id = emailIndex.get(email.toLowerCase());
        return Optional.ofNullable(id != null ? storeById.get(id) : null);
    }

    public boolean existsByUsername(String username) {
        return username != null && usernameIndex.containsKey(username.toLowerCase());
    }

    public boolean existsByEmail(String email) {
        return email != null && emailIndex.containsKey(email.toLowerCase());
    }

    public List<User> findAllById(Iterable<String> ids) {
        List<User> result = new ArrayList<>();
        for (String id : ids) {
            User u = storeById.get(id);
            if (u != null) result.add(u);
        }
        return result;
    }

    public List<User> findByIsGuestTrueAndLastActiveAtBefore(Instant threshold) {
        return storeById.values().stream()
                .filter(u -> u.isGuest()
                        && u.getLastActiveAt() != null
                        && u.getLastActiveAt().isBefore(threshold))
                .collect(Collectors.toList());
    }
}
