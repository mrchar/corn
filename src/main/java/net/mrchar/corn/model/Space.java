package net.mrchar.corn.model;

import jakarta.persistence.*;
import lombok.Getter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.ZonedDateTime;
import java.util.UUID;

@Getter
@Entity
@Table(name = "space")
@EntityListeners(AuditingEntityListener.class)
public class Space {
    @Id
    @Column(name = "id")
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "name")
    private String name;

    @CreatedDate
    @Column(name = "created", columnDefinition = "TIMESTAMP")
    private ZonedDateTime created;

    @LastModifiedDate
    @Column(name = "modified", columnDefinition = "TIMESTAMP")
    private ZonedDateTime modified;
}
