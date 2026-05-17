package com.spatialmeet;

import com.spatialmeet.repository.RoomRepository;
import com.spatialmeet.repository.UserRepository;
import com.spatialmeet.service.RoomService;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class SpatialMeetApplication {

    public static void main(String[] args) {
        SpringApplication.run(SpatialMeetApplication.class, args);
    }

    /** Provide in-memory repositories as Spring beans — no MongoDB needed. */
    @Bean
    public RoomRepository roomRepository() {
        return new RoomRepository();
    }

    @Bean
    public UserRepository userRepository() {
        return new UserRepository();
    }

    @Bean
    public CommandLineRunner initializeCache(RoomService roomService) {
        return args -> {
            roomService.syncCache();
        };
    }
}