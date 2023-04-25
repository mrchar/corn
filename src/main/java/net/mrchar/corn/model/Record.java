package net.mrchar.corn.model;

import jakarta.persistence.*;
import lombok.Getter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;

import java.time.ZonedDateTime;
import java.util.UUID;

@Getter
@Entity
@Table(name = "record")
public class Record {
    @Id
    @Column(name = "id")
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne
    @JoinColumn(name = "quota_id")
    private Quota quota;

    @CreatedDate
    @Column(name = "created", columnDefinition = "TIMESTAMP")
    private ZonedDateTime created;

    @LastModifiedDate
    @Column(name = "modified", columnDefinition = "TIMESTAMP")
    private ZonedDateTime modified;
}
